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

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

// ---- Context resolvers (act scoping) ----

async function ctxForList(setListId: string) {
  return prisma.setList.findUnique({
    where: { id: setListId },
    select: { id: true, actId: true, act: { select: { slug: true } } },
  });
}

async function ctxForSet(setId: string) {
  const s = await prisma.setListSet.findUnique({
    where: { id: setId },
    select: {
      setListId: true,
      setList: { select: { id: true, actId: true, act: { select: { slug: true } } } },
    },
  });
  return s;
}

async function ctxForEntry(entryId: string) {
  const e = await prisma.setEntry.findUnique({
    where: { id: entryId },
    select: {
      setId: true,
      set: {
        select: {
          setListId: true,
          setList: {
            select: { id: true, actId: true, act: { select: { slug: true } } },
          },
        },
      },
    },
  });
  return e;
}

function revalidateList(slug: string, setListId: string) {
  revalidatePath(`/acts/${slug}/setlists`);
  revalidatePath(`/acts/${slug}/setlists/${setListId}`);
}

// ---- Set lists ----

export async function createSetList(input: {
  actId: string;
  name: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, name, notes } = z
      .object({
        actId: z.string().min(1),
        name: z.string().trim().min(1, "Name is required.").max(200),
        notes: z.string().trim().max(5000).optional(),
      })
      .parse(input);
    await requireCapability(user, actId, "setlist:write");

    const act = await prisma.act.findUnique({
      where: { id: actId },
      select: { slug: true },
    });
    if (!act) return { ok: false, error: "Act not found." };

    const created = await prisma.setList.create({
      data: {
        actId,
        name,
        notes: notes || null,
        createdById: user.id,
        sets: { create: { name: "Set 1", sortOrder: 1 } },
      },
      select: { id: true },
    });
    revalidatePath(`/acts/${act.slug}/setlists`);
    return { ok: true, data: { id: created.id } };
  });
}

export async function updateSetList(input: {
  setListId: string;
  name: string;
  notes?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setListId, name, notes } = z
      .object({
        setListId: z.string().min(1),
        name: z.string().trim().min(1, "Name is required.").max(200),
        notes: z.string().trim().max(5000).optional(),
      })
      .parse(input);
    const ctx = await ctxForList(setListId);
    if (!ctx) return { ok: false, error: "Set list not found." };
    await requireCapability(user, ctx.actId, "setlist:write");
    await prisma.setList.update({
      where: { id: setListId },
      data: { name, notes: notes || null },
    });
    revalidateList(ctx.act.slug, setListId);
    return { ok: true };
  });
}

export async function deleteSetList(input: {
  setListId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setListId } = z.object({ setListId: z.string().min(1) }).parse(input);
    const ctx = await ctxForList(setListId);
    if (!ctx) return { ok: false, error: "Set list not found." };
    await requireCapability(user, ctx.actId, "setlist:write");
    // Cascades to sets and entries. Bookings keep their row (setListId → null).
    await prisma.setList.delete({ where: { id: setListId } });
    revalidatePath(`/acts/${ctx.act.slug}/setlists`);
    return { ok: true };
  });
}

/** Deep copy a set list, its sets, and every entry (§ full copy). */
export async function duplicateSetList(input: {
  setListId: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { setListId } = z.object({ setListId: z.string().min(1) }).parse(input);
    const ctx = await ctxForList(setListId);
    if (!ctx) return { ok: false, error: "Set list not found." };
    await requireCapability(user, ctx.actId, "setlist:write");

    const src = await prisma.setList.findUnique({
      where: { id: setListId },
      include: { sets: { include: { entries: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!src) return { ok: false, error: "Set list not found." };

    const created = await prisma.setList.create({
      data: {
        actId: src.actId,
        name: `Copy of ${src.name}`,
        notes: src.notes,
        createdById: user.id,
        sets: {
          create: src.sets.map((set) => ({
            name: set.name,
            notes: set.notes,
            sortOrder: set.sortOrder,
            entries: {
              create: set.entries
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((e) => ({
                  position: e.position,
                  kind: e.kind,
                  songId: e.songId,
                  banterDescription: e.banterDescription,
                  banterSeconds: e.banterSeconds,
                  notes: e.notes,
                })),
            },
          })),
        },
      },
      select: { id: true },
    });
    revalidatePath(`/acts/${ctx.act.slug}/setlists`);
    return { ok: true, data: { id: created.id } };
  });
}

// ---- Sets ----

export async function createSet(input: {
  setListId: string;
  name?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setListId, name } = z
      .object({
        setListId: z.string().min(1),
        name: z.string().trim().max(120).optional(),
      })
      .parse(input);
    const ctx = await ctxForList(setListId);
    if (!ctx) return { ok: false, error: "Set list not found." };
    await requireCapability(user, ctx.actId, "setlist:write");

    const count = await prisma.setListSet.count({ where: { setListId } });
    await prisma.setListSet.create({
      data: { setListId, name: name || `Set ${count + 1}`, sortOrder: count + 1 },
    });
    revalidateList(ctx.act.slug, setListId);
    return { ok: true };
  });
}

export async function updateSet(input: {
  setId: string;
  name: string;
  notes?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId, name, notes } = z
      .object({
        setId: z.string().min(1),
        name: z.string().trim().min(1, "Name is required.").max(120),
        notes: z.string().trim().max(5000).optional(),
      })
      .parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    await requireCapability(user, ctx.setList.actId, "setlist:write");
    await prisma.setListSet.update({
      where: { id: setId },
      data: { name, notes: notes || null },
    });
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}

export async function deleteSet(input: { setId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId } = z.object({ setId: z.string().min(1) }).parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    await requireCapability(user, ctx.setList.actId, "setlist:write");
    await prisma.setListSet.delete({ where: { id: setId } });
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}

export async function reorderSets(input: {
  setListId: string;
  orderedSetIds: string[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setListId, orderedSetIds } = z
      .object({
        setListId: z.string().min(1),
        orderedSetIds: z.array(z.string().min(1)).max(100),
      })
      .parse(input);
    const ctx = await ctxForList(setListId);
    if (!ctx) return { ok: false, error: "Set list not found." };
    await requireCapability(user, ctx.actId, "setlist:write");

    const sets = await prisma.setListSet.findMany({
      where: { setListId },
      select: { id: true },
    });
    const valid = new Set(sets.map((s) => s.id));
    await prisma.$transaction(
      orderedSetIds
        .filter((id) => valid.has(id))
        .map((id, index) =>
          prisma.setListSet.update({ where: { id }, data: { sortOrder: index + 1 } }),
        ),
    );
    revalidateList(ctx.act.slug, setListId);
    return { ok: true };
  });
}

// ---- Set entries (songs + banter) ----

async function nextPosition(setId: string): Promise<number> {
  const max = await prisma.setEntry.aggregate({
    where: { setId },
    _max: { position: true },
  });
  return (max._max.position ?? 0) + 1;
}

/**
 * Add a song to a set. Either link an existing library song (`songId`) or,
 * when only a `title` is given with no library match, auto-create a Song
 * (status IDEA) in the act and reference it.
 */
export async function addSetSong(input: {
  setId: string;
  songId?: string;
  title?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId, songId, title } = z
      .object({
        setId: z.string().min(1),
        songId: z.string().min(1).optional(),
        title: z.string().trim().min(1).max(200).optional(),
      })
      .parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    const actId = ctx.setList.actId;
    await requireCapability(user, actId, "setlist:write");

    let resolvedSongId = songId ?? null;
    if (resolvedSongId) {
      const song = await prisma.song.findFirst({
        where: { id: resolvedSongId, actId },
        select: { id: true },
      });
      if (!song) return { ok: false, error: "Song not found in this act." };
    } else {
      if (!title) return { ok: false, error: "Provide a song or a title." };
      // Auto-create a library entry for the typed title.
      const created = await prisma.song.create({
        data: { actId, title, status: "IDEA" },
        select: { id: true },
      });
      resolvedSongId = created.id;
    }

    await prisma.setEntry.create({
      data: {
        setId,
        kind: "SONG",
        songId: resolvedSongId,
        position: await nextPosition(setId),
      },
    });
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}

/**
 * Add every song in an album to a set, ordered by track number (falling back
 * to title). Songs are matched by their `album` field within the act.
 */
export async function addSetAlbum(input: {
  setId: string;
  album: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId, album } = z
      .object({
        setId: z.string().min(1),
        album: z.string().trim().min(1).max(200),
      })
      .parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    const actId = ctx.setList.actId;
    await requireCapability(user, actId, "setlist:write");

    const songs = await prisma.song.findMany({
      where: { actId, album, status: { not: "RETIRED" } },
      select: { id: true },
      orderBy: [{ trackNo: "asc" }, { title: "asc" }],
    });
    if (songs.length === 0) return { ok: false, error: "No songs found for this album." };

    let position = await nextPosition(setId);
    await prisma.setEntry.createMany({
      data: songs.map((s) => ({
        setId,
        kind: "SONG" as const,
        songId: s.id,
        position: position++,
      })),
    });
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}

export async function addSetBanter(input: {
  setId: string;
  description: string;
  seconds?: number | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId, description, seconds } = z
      .object({
        setId: z.string().min(1),
        description: z.string().trim().min(1, "Description is required.").max(500),
        seconds: z.number().int().min(0).max(36000).nullable().optional(),
      })
      .parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    await requireCapability(user, ctx.setList.actId, "setlist:write");

    await prisma.setEntry.create({
      data: {
        setId,
        kind: "BANTER",
        banterDescription: description,
        banterSeconds: seconds ?? null,
        position: await nextPosition(setId),
      },
    });
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}

export async function updateSetEntry(input: {
  entryId: string;
  notes?: string;
  banterDescription?: string;
  banterSeconds?: number | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, notes, banterDescription, banterSeconds } = z
      .object({
        entryId: z.string().min(1),
        notes: z.string().trim().max(2000).optional(),
        banterDescription: z.string().trim().min(1).max(500).optional(),
        banterSeconds: z.number().int().min(0).max(36000).nullable().optional(),
      })
      .parse(input);
    const ctx = await ctxForEntry(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.set.setList.actId, "setlist:write");

    await prisma.setEntry.update({
      where: { id: entryId },
      data: {
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(banterDescription !== undefined ? { banterDescription } : {}),
        ...(banterSeconds !== undefined ? { banterSeconds } : {}),
      },
    });
    revalidateList(ctx.set.setList.act.slug, ctx.set.setListId);
    return { ok: true };
  });
}

export async function removeSetEntry(input: {
  entryId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId } = z.object({ entryId: z.string().min(1) }).parse(input);
    const ctx = await ctxForEntry(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.set.setList.actId, "setlist:write");
    await prisma.setEntry.delete({ where: { id: entryId } });
    revalidateList(ctx.set.setList.act.slug, ctx.set.setListId);
    return { ok: true };
  });
}

export async function reorderSetEntries(input: {
  setId: string;
  orderedEntryIds: string[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setId, orderedEntryIds } = z
      .object({
        setId: z.string().min(1),
        orderedEntryIds: z.array(z.string().min(1)).max(500),
      })
      .parse(input);
    const ctx = await ctxForSet(setId);
    if (!ctx) return { ok: false, error: "Set not found." };
    await requireCapability(user, ctx.setList.actId, "setlist:write");

    const entries = await prisma.setEntry.findMany({
      where: { setId },
      select: { id: true },
    });
    const valid = new Set(entries.map((e) => e.id));
    await prisma.$transaction(
      orderedEntryIds
        .filter((id) => valid.has(id))
        .map((id, index) =>
          prisma.setEntry.update({ where: { id }, data: { position: index + 1 } }),
        ),
    );
    revalidateList(ctx.setList.act.slug, ctx.setListId);
    return { ok: true };
  });
}
