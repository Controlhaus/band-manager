import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isActMember } from "@/lib/permissions";
import { buildLyricsTxt, fileSlug, type LyricsExportItem } from "@/lib/setlist-export";

/**
 * Download the lyrics of every song in a reusable set-list as a plain-text
 * booklet. Songs without lyrics are skipped; each song appears once, in set
 * order. Membership-checked, served as an attachment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "txt";
  if (format !== "txt") {
    return NextResponse.json({ error: "format must be txt" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setList = await prisma.setList.findUnique({
    where: { id },
    select: {
      name: true,
      actId: true,
      act: { select: { slug: true } },
      sets: {
        orderBy: { sortOrder: "asc" },
        select: {
          entries: {
            orderBy: { position: "asc" },
            select: {
              kind: true,
              song: {
                select: { id: true, title: true, artist: true, lyrics: true },
              },
            },
          },
        },
      },
    },
  });

  if (!setList) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isActMember(session, setList.actId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: LyricsExportItem[] = [];
  const seen = new Set<string>();
  for (const set of setList.sets) {
    for (const entry of set.entries) {
      const song = entry.song;
      if (entry.kind !== "SONG" || !song || !song.lyrics?.trim()) continue;
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      items.push({ title: song.title, artist: song.artist, lyrics: song.lyrics });
    }
  }

  const body = buildLyricsTxt(items);
  const filename = `${setList.act.slug}-${fileSlug(setList.name)}-lyrics.txt`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
