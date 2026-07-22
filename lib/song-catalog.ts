import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Song catalog querying (§7.3, §14.5). Per-user "rehearsed"/"performed" sorting
 * is done in SQL via a LEFT JOIN on user_song_status scoped to the current
 * user, with a whitelisted ORDER BY (never interpolating user input into SQL
 * identifiers).
 */

export const CATALOG_PAGE_SIZE = 50;

export type CatalogSort =
  | "title"
  | "artist"
  | "album"
  | "trackNo"
  | "style"
  | "key"
  | "tempoBpm"
  | "durationSec"
  | "status"
  | "rehearsed"
  | "performed"
  | "updatedAt";

// Whitelist: sort key → safe SQL expression.
const SORT_SQL: Record<CatalogSort, string> = {
  title: "s.title",
  artist: "s.artist",
  album: "s.album",
  trackNo: 's."trackNo"',
  style: "s.style",
  key: 's."key"',
  tempoBpm: 's."tempoBpm"',
  durationSec: 's."durationSec"',
  status: "s.status",
  rehearsed: "rehearsed",
  performed: '"performedCount"',
  updatedAt: 's."updatedAt"',
};

export function isCatalogSort(v: string): v is CatalogSort {
  return v in SORT_SQL;
}

export type CatalogRow = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  trackNo: number | null;
  style: string | null;
  key: string | null;
  tempoBpm: number | null;
  durationSec: number | null;
  status: string;
  updatedAt: Date;
  coverArtUrl: string | null;
  rehearsed: boolean;
  performedCount: number;
  platforms: string[];
};

export type CatalogQuery = {
  actId: string;
  userId: string;
  search?: string;
  style?: string;
  status?: string;
  sort: CatalogSort;
  order: "asc" | "desc";
  page: number;
};

export type CatalogResult = {
  rows: CatalogRow[];
  total: number;
  page: number;
  pageCount: number;
  styles: string[];
};

export async function queryCatalog(q: CatalogQuery): Promise<CatalogResult> {
  const conditions: Prisma.Sql[] = [Prisma.sql`s."actId" = ${q.actId}`];
  if (q.search) {
    const like = `%${q.search}%`;
    conditions.push(
      Prisma.sql`(s.title ILIKE ${like} OR s.artist ILIKE ${like})`,
    );
  }
  if (q.style) conditions.push(Prisma.sql`s.style = ${q.style}`);
  if (q.status) {
    conditions.push(Prisma.sql`s.status = ${q.status}::"SongStatus"`);
  }
  const where = Prisma.join(conditions, " AND ");

  const col = SORT_SQL[q.sort];
  const dir = q.order === "desc" ? "DESC" : "ASC";
  const orderBy = Prisma.raw(`${col} ${dir} NULLS LAST, s.title ASC`);

  const offset = (q.page - 1) * CATALOG_PAGE_SIZE;

  const rows = await prisma.$queryRaw<
    Omit<CatalogRow, "platforms">[]
  >(Prisma.sql`
    SELECT s.id, s.title, s.artist, s.album, s."trackNo", s.style, s."key",
           s."tempoBpm", s."durationSec", s.status::text AS status, s."updatedAt",
           s."coverArtUrl",
           COALESCE(us.rehearsed, false) AS rehearsed,
           COALESCE(us."performedCount", 0)::int AS "performedCount"
    FROM song s
    LEFT JOIN user_song_status us
      ON us."songId" = s.id AND us."userId" = ${q.userId}
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${CATALOG_PAGE_SIZE} OFFSET ${offset}
  `);

  const totalRows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM song s WHERE ${where}
  `);
  const total = totalRows[0]?.count ?? 0;

  // Attach link platforms for the page's songs.
  const ids = rows.map((r) => r.id);
  const links =
    ids.length > 0
      ? await prisma.songLink.findMany({
          where: { songId: { in: ids } },
          select: { songId: true, platform: true },
        })
      : [];
  const platformsBySong = new Map<string, string[]>();
  for (const l of links) {
    const arr = platformsBySong.get(l.songId) ?? [];
    if (!arr.includes(l.platform)) arr.push(l.platform);
    platformsBySong.set(l.songId, arr);
  }

  // Distinct styles for the filter (§16.6).
  const styleRows = await prisma.song.findMany({
    where: { actId: q.actId, style: { not: null } },
    select: { style: true },
    distinct: ["style"],
    orderBy: { style: "asc" },
  });

  return {
    rows: rows.map((r) => ({
      ...r,
      rehearsed: Boolean(r.rehearsed),
      platforms: platformsBySong.get(r.id) ?? [],
    })),
    total,
    page: q.page,
    pageCount: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
    styles: styleRows.map((s) => s.style!).filter(Boolean),
  };
}
