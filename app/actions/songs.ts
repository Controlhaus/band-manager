"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { deleteAssetsFor } from "@/lib/files";
import {
  AuthorizationError,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function actIdForSong(songId: string): Promise<string | null> {
  const s = await prisma.song.findUnique({
    where: { id: songId },
    select: { actId: true },
  });
  return s?.actId ?? null;
}

async function slugForAct(actId: string): Promise<string | null> {
  const a = await prisma.act.findUnique({
    where: { id: actId },
    select: { slug: true },
  });
  return a?.slug ?? null;
}

const songFields = {
  title: z.string().trim().min(1, "Title is required.").max(200),
  artist: z.string().trim().max(200).optional(),
  album: z.string().trim().max(200).optional(),
  trackNo: z.number().int().min(1).max(999).optional().nullable(),
  style: z.string().trim().max(100).optional(),
  key: z.string().trim().max(20).optional(),
  tempoBpm: z.number().int().min(20).max(400).optional().nullable(),
  durationSec: z.number().int().min(0).max(36000).optional().nullable(),
  status: z
    .enum(["IDEA", "REHEARSING", "REHEARSED", "PERFORMED", "RETIRED"])
    .optional(),
  notes: z.string().trim().max(5000).optional(),
};

const createSchema = z.object({ actId: z.string().min(1), ...songFields });

export async function createSong(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = createSchema.parse(input);
    await requireCapability(user, data.actId, "song:write");

    const song = await prisma.song.create({
      data: {
        actId: data.actId,
        title: data.title,
        artist: data.artist || null,
        album: data.album || null,
        trackNo: data.trackNo ?? null,
        style: data.style || null,
        key: data.key || null,
        tempoBpm: data.tempoBpm ?? null,
        durationSec: data.durationSec ?? null,
        status: data.status ?? "IDEA",
        notes: data.notes || null,
      },
      select: { id: true },
    });
    const slug = await slugForAct(data.actId);
    if (slug) revalidatePath(`/acts/${slug}/songs`);
    return { ok: true, data: { id: song.id } };
  });
}

const updateSchema = z.object({ songId: z.string().min(1), ...songFields });

export async function updateSong(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = updateSchema.parse(input);
    const actId = await actIdForSong(data.songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");

    await prisma.song.update({
      where: { id: data.songId },
      data: {
        title: data.title,
        artist: data.artist || null,
        album: data.album || null,
        trackNo: data.trackNo ?? null,
        style: data.style || null,
        key: data.key || null,
        tempoBpm: data.tempoBpm ?? null,
        durationSec: data.durationSec ?? null,
        ...(data.status ? { status: data.status } : {}),
        notes: data.notes || null,
      },
    });
    const slug = await slugForAct(actId);
    if (slug) {
      revalidatePath(`/acts/${slug}/songs`);
      revalidatePath(`/acts/${slug}/songs/${data.songId}`);
    }
    return { ok: true };
  });
}

export async function updateSongLyrics(input: {
  songId: string;
  lyrics: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId, lyrics } = z
      .object({ songId: z.string().min(1), lyrics: z.string().max(50000) })
      .parse(input);
    const actId = await actIdForSong(songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");
    await prisma.song.update({
      where: { id: songId },
      data: { lyrics: lyrics || null },
    });
    const slug = await slugForAct(actId);
    if (slug) revalidatePath(`/acts/${slug}/songs/${songId}`);
    return { ok: true };
  });
}

export async function retireSong(input: {
  songId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId } = z.object({ songId: z.string().min(1) }).parse(input);
    const actId = await actIdForSong(songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");
    await prisma.song.update({
      where: { id: songId },
      data: { status: "RETIRED" },
    });
    const slug = await slugForAct(actId);
    if (slug) {
      revalidatePath(`/acts/${slug}/songs`);
      revalidatePath(`/acts/${slug}/songs/${songId}`);
    }
    return { ok: true };
  });
}

export async function deleteSong(input: {
  songId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId } = z.object({ songId: z.string().min(1) }).parse(input);
    const actId = await actIdForSong(songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");

    // Block hard delete if referenced by any setlist (§14.4); offer retire.
    const refs = await prisma.setlistItem.count({ where: { songId } });
    if (refs > 0) {
      return {
        ok: false,
        error:
          "This song is used in a setlist. Retire it instead of deleting.",
      };
    }

    // Clean polymorphic files for the song and its versions, then delete.
    const versions = await prisma.songVersion.findMany({
      where: { songId },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await deleteAssetsFor("SONG", songId, tx);
      for (const v of versions) {
        await deleteAssetsFor("SONG_VERSION", v.id, tx);
      }
      await tx.song.delete({ where: { id: songId } });
    });

    const slug = await slugForAct(actId);
    if (slug) revalidatePath(`/acts/${slug}/songs`);
    return { ok: true };
  });
}

/** Full copy of a song (fields, versions, links) with a "Copy of " title. */
export async function duplicateSong(input: {
  songId: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId } = z.object({ songId: z.string().min(1) }).parse(input);
    const actId = await actIdForSong(songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");

    const src = await prisma.song.findUnique({
      where: { id: songId },
      include: { versions: true, links: true },
    });
    if (!src) return { ok: false, error: "Song not found." };

    const created = await prisma.$transaction(async (tx) => {
      const song = await tx.song.create({
        data: {
          actId: src.actId,
          title: `Copy of ${src.title}`,
          artist: src.artist,
          album: src.album,
          trackNo: src.trackNo,
          style: src.style,
          key: src.key,
          tempoBpm: src.tempoBpm,
          durationSec: src.durationSec,
          lyrics: src.lyrics,
          notes: src.notes,
          status: src.status,
        },
        select: { id: true },
      });

      // Copy versions, tracking old → new ids so version-scoped links remap.
      const versionIdMap = new Map<string, string>();
      for (const v of src.versions) {
        const nv = await tx.songVersion.create({
          data: { songId: song.id, name: v.name, key: v.key, notes: v.notes },
          select: { id: true },
        });
        versionIdMap.set(v.id, nv.id);
      }

      for (const l of src.links) {
        await tx.songLink.create({
          data: {
            songId: song.id,
            versionId: l.versionId ? versionIdMap.get(l.versionId) ?? null : null,
            platform: l.platform,
            url: l.url,
            label: l.label,
          },
        });
      }
      return song;
    });

    const slug = await slugForAct(actId);
    if (slug) revalidatePath(`/acts/${slug}/songs`);
    return { ok: true, data: { id: created.id } };
  });
}

// ---- Streaming links ----

const PLATFORM_HOST: Record<string, string | null> = {
  SPOTIFY: "spotify",
  YOUTUBE: "youtu",
  APPLE_MUSIC: "apple",
  SOUNDCLOUD: "soundcloud",
  OTHER: null,
};

const linkSchema = z.object({
  id: z.string().optional(),
  songId: z.string().min(1),
  versionId: z.string().optional().nullable(),
  platform: z.enum(["SPOTIFY", "YOUTUBE", "APPLE_MUSIC", "SOUNDCLOUD", "OTHER"]),
  url: z.string().url("Enter a valid URL."),
  label: z.string().trim().max(120).optional(),
});

export async function upsertSongLink(
  input: z.infer<typeof linkSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = linkSchema.parse(input);
    const actId = await actIdForSong(data.songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");

    const wantHost = PLATFORM_HOST[data.platform];
    if (wantHost) {
      const host = new URL(data.url).hostname.toLowerCase();
      if (!host.includes(wantHost)) {
        return {
          ok: false,
          error: `That doesn't look like a ${data.platform.replace("_", " ").toLowerCase()} URL.`,
        };
      }
    }

    if (data.id) {
      await prisma.songLink.update({
        where: { id: data.id },
        data: {
          platform: data.platform,
          url: data.url,
          label: data.label || null,
          versionId: data.versionId || null,
        },
      });
    } else {
      await prisma.songLink.create({
        data: {
          songId: data.songId,
          platform: data.platform,
          url: data.url,
          label: data.label || null,
          versionId: data.versionId || null,
        },
      });
    }
    const slug = await slugForAct(actId);
    if (slug) revalidatePath(`/acts/${slug}/songs/${data.songId}`);
    return { ok: true };
  });
}

export async function deleteSongLink(input: {
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    const link = await prisma.songLink.findUnique({
      where: { id },
      select: { songId: true, song: { select: { actId: true } } },
    });
    if (!link) return { ok: false, error: "Link not found." };
    await requireCapability(user, link.song.actId, "song:write");
    await prisma.songLink.delete({ where: { id } });
    const slug = await slugForAct(link.song.actId);
    if (slug) revalidatePath(`/acts/${slug}/songs/${link.songId}`);
    return { ok: true };
  });
}

// ---- Versions ----

const versionSchema = z.object({
  id: z.string().optional(),
  songId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(120),
  key: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function upsertSongVersion(
  input: z.infer<typeof versionSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = versionSchema.parse(input);
    const actId = await actIdForSong(data.songId);
    if (!actId) return { ok: false, error: "Song not found." };
    await requireCapability(user, actId, "song:write");

    if (data.id) {
      await prisma.songVersion.update({
        where: { id: data.id },
        data: { name: data.name, key: data.key || null, notes: data.notes || null },
      });
    } else {
      await prisma.songVersion.create({
        data: {
          songId: data.songId,
          name: data.name,
          key: data.key || null,
          notes: data.notes || null,
        },
      });
    }
    const slug = await slugForAct(actId);
    if (slug) revalidatePath(`/acts/${slug}/songs/${data.songId}`);
    return { ok: true };
  });
}

export async function deleteSongVersion(input: {
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    const version = await prisma.songVersion.findUnique({
      where: { id },
      select: { songId: true, song: { select: { actId: true } } },
    });
    if (!version) return { ok: false, error: "Version not found." };
    await requireCapability(user, version.song.actId, "song:write");

    const refs = await prisma.setlistItem.count({
      where: { songVersionId: id },
    });
    if (refs > 0) {
      return {
        ok: false,
        error: "This version is used in a setlist and can't be deleted.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await deleteAssetsFor("SONG_VERSION", id, tx);
      await tx.songVersion.delete({ where: { id } });
    });
    const slug = await slugForAct(version.song.actId);
    if (slug) revalidatePath(`/acts/${slug}/songs/${version.songId}`);
    return { ok: true };
  });
}
