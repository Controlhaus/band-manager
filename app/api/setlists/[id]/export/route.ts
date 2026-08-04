import { NextRequest, NextResponse } from "next/server";
import type { SongPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isActMember } from "@/lib/permissions";
import {
  fileSlug,
  isExportFormat,
  renderExport,
  type ExportItem,
} from "@/lib/setlist-export";

/**
 * §18.12 — export a calendar-entry setlist as ?format=m3u|csv|txt.
 * Membership-checked (403 for non-members), served as an attachment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format");
  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: "format must be m3u, csv or txt" },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setlist = await prisma.setlist.findUnique({
    where: { id },
    select: {
      name: true,
      entry: {
        select: {
          actId: true,
          startsAt: true,
          act: { select: { slug: true } },
        },
      },
      items: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          songVersionId: true,
          notes: true,
          song: {
            select: {
              title: true,
              artist: true,
              album: true,
              durationSec: true,
              key: true,
              tempoBpm: true,
              links: {
                select: { platform: true, url: true, versionId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!setlist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isActMember(session, setlist.entry.actId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: ExportItem[] = setlist.items.map((item) => {
    // Version-level link wins over song-level for the same platform.
    const links: Partial<Record<SongPlatform, string>> = {};
    for (const link of item.song.links) {
      if (link.versionId === null) links[link.platform] ??= link.url;
    }
    for (const link of item.song.links) {
      if (link.versionId === item.songVersionId) links[link.platform] = link.url;
    }
    return {
      position: item.position,
      title: item.song.title,
      artist: item.song.artist,
      album: item.song.album,
      durationSec: item.song.durationSec,
      key: item.song.key,
      tempoBpm: item.song.tempoBpm,
      notes: item.notes,
      links,
    };
  });

  const { body, contentType, ext } = renderExport(format, items);
  const date = setlist.entry.startsAt.toISOString().slice(0, 10);
  const filename = `${setlist.entry.act.slug}-${date}-${fileSlug(setlist.name)}.${ext}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
