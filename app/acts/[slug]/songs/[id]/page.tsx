import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { songUsage } from "@/lib/set-lists-queries";
import { SongDetail } from "@/components/songs/song-detail";
import type { FileItem } from "@/components/files/file-list";

export const dynamic = "force-dynamic";

export default async function SongDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const song = await prisma.song.findFirst({
    where: { id, actId: act.id },
    include: {
      links: { orderBy: { createdAt: "asc" } },
      versions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!song) notFound();

  const versionIds = song.versions.map((v) => v.id);
  const [songFiles, versionFiles, status, usedIn] = await Promise.all([
    prisma.fileAsset.findMany({
      where: { entityType: "SONG", entityId: song.id },
      orderBy: { createdAt: "asc" },
    }),
    versionIds.length
      ? prisma.fileAsset.findMany({
          where: { entityType: "SONG_VERSION", entityId: { in: versionIds } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.userSongStatus.findUnique({
      where: { userId_songId: { userId: user.id, songId: song.id } },
    }),
    songUsage(song.id),
  ]);

  const toFileItem = (f: {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }): FileItem => ({
    id: f.id,
    filename: f.filename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
  });

  const filesByVersion = new Map<string, FileItem[]>();
  for (const f of versionFiles) {
    const arr = filesByVersion.get(f.entityId) ?? [];
    arr.push(toFileItem(f));
    filesByVersion.set(f.entityId, arr);
  }

  return (
    <SongDetail
      slug={slug}
      canWrite={can(act.role, "song:write")}
      song={{
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        style: song.style,
        key: song.key,
        tempoBpm: song.tempoBpm,
        durationSec: song.durationSec,
        status: song.status,
        lyrics: song.lyrics ?? "",
        notes: song.notes ?? "",
      }}
      links={song.links.map((l) => ({
        id: l.id,
        platform: l.platform,
        url: l.url,
        label: l.label,
        versionId: l.versionId,
      }))}
      versions={song.versions.map((v) => ({
        id: v.id,
        name: v.name,
        key: v.key,
        notes: v.notes,
        files: filesByVersion.get(v.id) ?? [],
      }))}
      songFiles={songFiles.map(toFileItem)}
      usedIn={usedIn.map((u) => ({
        setListId: u.setListId,
        setListName: u.setListName,
        setName: u.setName,
        href: `/acts/${slug}/setlists/${u.setListId}`,
      }))}
      myStatus={{
        rehearsed: status?.rehearsed ?? false,
        performedCount: status?.performedCount ?? 0,
      }}
    />
  );
}
