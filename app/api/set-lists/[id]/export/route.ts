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
 * §18.12 — export a reusable set-list (library) as ?format=m3u|csv|txt.
 * Flattens every set's entries in order; banter blocks are skipped for song
 * exports. Membership-checked, served as an attachment.
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
              notes: true,
              songVersionId: true,
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
      },
    },
  });

  if (!setList) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isActMember(session, setList.actId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: ExportItem[] = [];
  let position = 0;
  for (const set of setList.sets) {
    for (const entry of set.entries) {
      if (entry.kind !== "SONG" || !entry.song) continue;
      position += 1;
      const links: Partial<Record<SongPlatform, string>> = {};
      // Version-specific links win over song-level ones (§19).
      if (entry.songVersionId) {
        for (const link of entry.song.links) {
          if (link.versionId === entry.songVersionId) links[link.platform] ??= link.url;
        }
      }
      for (const link of entry.song.links) {
        if (link.versionId === null) links[link.platform] ??= link.url;
      }
      items.push({
        position,
        title: entry.song.title,
        artist: entry.song.artist,
        album: entry.song.album,
        durationSec: entry.song.durationSec,
        key: entry.song.key,
        tempoBpm: entry.song.tempoBpm,
        notes: entry.notes,
        links,
      });
    }
  }

  const { body, contentType, ext } = renderExport(format, items);
  const filename = `${setList.act.slug}-${fileSlug(setList.name)}.${ext}`;

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
