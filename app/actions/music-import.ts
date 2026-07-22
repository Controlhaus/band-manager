"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  AuthorizationError,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";
import {
  searchReleases,
  getReleaseTracks,
  streamingSearchLinks,
  type ReleaseCandidate,
} from "@/lib/musicbrainz";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function slugForAct(actId: string): Promise<string | null> {
  const a = await prisma.act.findUnique({
    where: { id: actId },
    select: { slug: true },
  });
  return a?.slug ?? null;
}

/** Case-insensitive key identifying a song by title + artist. */
function dedupeKey(title: string, artist: string | null): string {
  return `${title.trim().toLowerCase()}|${(artist ?? "").trim().toLowerCase()}`;
}

// ---- search ----------------------------------------------------------------

const searchSchema = z.object({
  actId: z.string().min(1),
  artist: z.string().trim().min(1, "Enter an artist.").max(200),
  album: z.string().trim().min(1, "Enter an album.").max(200),
});

export async function searchAlbum(
  input: z.infer<typeof searchSchema>,
): Promise<ActionResult<ReleaseCandidate[]>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = searchSchema.parse(input);
    await requireCapability(user, data.actId, "song:write");

    const res = await searchReleases(data.artist, data.album);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: res.data };
  });
}

// ---- load tracklist --------------------------------------------------------

const tracksSchema = z.object({
  actId: z.string().min(1),
  releaseMbid: z.string().uuid(),
});

export type PreviewTrack = {
  title: string;
  trackNo: number | null;
  durationSec: number | null;
  style: string | null;
  exists: boolean;
};

export async function getAlbumTracks(
  input: z.infer<typeof tracksSchema>,
): Promise<
  ActionResult<{
    releaseMbid: string;
    album: string;
    artist: string;
    hasCoverArt: boolean;
    tracks: PreviewTrack[];
  }>
> {
  return runAction(async () => {
    const user = await requireUser();
    const data = tracksSchema.parse(input);
    await requireCapability(user, data.actId, "song:write");

    const res = await getReleaseTracks(data.releaseMbid);
    if (!res.ok) return { ok: false, error: res.error };

    const existing = await prisma.song.findMany({
      where: { actId: data.actId },
      select: { title: true, artist: true },
    });
    const existingKeys = new Set(
      existing.map((s) => dedupeKey(s.title, s.artist)),
    );

    const tracks: PreviewTrack[] = res.data.tracks.map((t) => ({
      ...t,
      exists: existingKeys.has(dedupeKey(t.title, res.data.artist)),
    }));

    return {
      ok: true,
      data: {
        releaseMbid: res.data.releaseMbid,
        album: res.data.album,
        artist: res.data.artist,
        hasCoverArt: res.data.hasCoverArt,
        tracks,
      },
    };
  });
}

// ---- import ----------------------------------------------------------------

const importSchema = z.object({
  actId: z.string().min(1),
  album: z.string().trim().max(200),
  artist: z.string().trim().max(200),
  releaseMbid: z.string().uuid(),
  hasCoverArt: z.boolean(),
  tracks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        trackNo: z.number().int().min(1).max(999).nullable(),
        durationSec: z.number().int().min(0).max(36000).nullable(),
        style: z.string().trim().max(100).nullable(),
      }),
    )
    .min(1, "Select at least one track.")
    .max(200),
});

export async function importAlbumTracks(
  input: z.infer<typeof importSchema>,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = importSchema.parse(input);
    await requireCapability(user, data.actId, "song:write");

    const existing = await prisma.song.findMany({
      where: { actId: data.actId },
      select: { title: true, artist: true },
    });
    const existingKeys = new Set(
      existing.map((s) => dedupeKey(s.title, s.artist)),
    );

    const artist = data.artist || null;
    const album = data.album || null;
    const coverArtUrl = data.hasCoverArt
      ? `/api/cover/${data.releaseMbid}`
      : null;

    // De-duplicate against the catalog and within this batch itself.
    const seen = new Set(existingKeys);
    const toCreate = data.tracks.filter((t) => {
      const key = dedupeKey(t.title, artist);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const skipped = data.tracks.length - toCreate.length;

    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const t of toCreate) {
          const song = await tx.song.create({
            data: {
              actId: data.actId,
              title: t.title,
              artist,
              album,
              trackNo: t.trackNo,
              style: t.style,
              durationSec: t.durationSec,
              coverArtUrl,
              status: "IDEA",
            },
            select: { id: true },
          });
          await tx.songLink.createMany({
            data: streamingSearchLinks(data.artist, t.title).map((l) => ({
              songId: song.id,
              platform: l.platform,
              url: l.url,
              label: l.label,
            })),
          });
        }
      });
    }

    const slug = await slugForAct(data.actId);
    if (slug) revalidatePath(`/acts/${slug}/songs`);
    return { ok: true, data: { created: toCreate.length, skipped } };
  });
}
