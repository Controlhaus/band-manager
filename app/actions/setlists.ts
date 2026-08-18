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
import { validatePlaylistUrl } from "@/lib/platform-links";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function ctxForEntry(entryId: string) {
  const e = await prisma.calendarEntry.findUnique({
    where: { id: entryId },
    select: { actId: true, act: { select: { slug: true } } },
  });
  return e;
}

async function ctxForSetlist(setlistId: string) {
  const s = await prisma.setlist.findUnique({
    where: { id: setlistId },
    select: {
      entryId: true,
      entry: { select: { actId: true, act: { select: { slug: true } } } },
    },
  });
  return s;
}

function revalidateEntry(slug: string, entryId: string) {
  revalidatePath(`/acts/${slug}/calendar/${entryId}`);
}

// Attach (or detach) an existing act set list to a calendar entry. References
// the reusable SetList library — never copies its contents.
export async function setEntrySetList(input: {
  entryId: string;
  setListId: string | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, setListId } = z
      .object({ entryId: z.string().min(1), setListId: z.string().min(1).nullable() })
      .parse(input);
    const ctx = await ctxForEntry(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.actId, "calendar:write");

    if (setListId) {
      const list = await prisma.setList.findFirst({
        where: { id: setListId, actId: ctx.actId },
        select: { id: true },
      });
      if (!list) return { ok: false, error: "Set list not found." };
    }

    await prisma.calendarEntry.update({
      where: { id: entryId },
      data: { setListId },
    });
    revalidateEntry(ctx.act.slug, entryId);
    return { ok: true };
  });
}

export async function createSetlist(input: {
  entryId: string;
  name?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, name } = z
      .object({ entryId: z.string().min(1), name: z.string().trim().max(120).optional() })
      .parse(input);
    const ctx = await ctxForEntry(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.actId, "calendar:write");

    const count = await prisma.setlist.count({ where: { entryId } });
    await prisma.setlist.create({
      data: {
        entryId,
        name: name || `Set ${count + 1}`,
        sortOrder: count + 1,
      },
    });
    revalidateEntry(ctx.act.slug, entryId);
    return { ok: true };
  });
}

export async function updateSetlist(input: {
  setlistId: string;
  name: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setlistId, name } = z
      .object({ setlistId: z.string().min(1), name: z.string().trim().min(1).max(120) })
      .parse(input);
    const ctx = await ctxForSetlist(setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");
    await prisma.setlist.update({ where: { id: setlistId }, data: { name } });
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function deleteSetlist(input: {
  setlistId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setlistId } = z.object({ setlistId: z.string().min(1) }).parse(input);
    const ctx = await ctxForSetlist(setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");
    await prisma.setlist.delete({ where: { id: setlistId } });
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function addSetlistItem(input: {
  setlistId: string;
  songId: string;
  songVersionId?: string | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setlistId, songId, songVersionId } = z
      .object({
        setlistId: z.string().min(1),
        songId: z.string().min(1),
        songVersionId: z.string().optional().nullable(),
      })
      .parse(input);
    const ctx = await ctxForSetlist(setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");

    // Ensure the song belongs to the same act.
    const song = await prisma.song.findFirst({
      where: { id: songId, actId: ctx.entry.actId },
      select: { id: true },
    });
    if (!song) return { ok: false, error: "Song not found in this act." };

    const max = await prisma.setlistItem.aggregate({
      where: { setlistId },
      _max: { position: true },
    });
    await prisma.setlistItem.create({
      data: {
        setlistId,
        songId,
        songVersionId: songVersionId || null,
        position: (max._max.position ?? 0) + 1,
      },
    });
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function updateSetlistItem(input: {
  itemId: string;
  notes: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { itemId, notes } = z
      .object({ itemId: z.string().min(1), notes: z.string().max(2000) })
      .parse(input);
    const item = await prisma.setlistItem.findUnique({
      where: { id: itemId },
      select: { setlistId: true },
    });
    if (!item) return { ok: false, error: "Item not found." };
    const ctx = await ctxForSetlist(item.setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");
    await prisma.setlistItem.update({
      where: { id: itemId },
      data: { notes: notes || null },
    });
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function removeSetlistItem(input: {
  itemId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { itemId } = z.object({ itemId: z.string().min(1) }).parse(input);
    const item = await prisma.setlistItem.findUnique({
      where: { id: itemId },
      select: { setlistId: true },
    });
    if (!item) return { ok: false, error: "Item not found." };
    const ctx = await ctxForSetlist(item.setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");
    await prisma.setlistItem.delete({ where: { id: itemId } });
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function reorderSetlistItems(input: {
  setlistId: string;
  orderedItemIds: string[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { setlistId, orderedItemIds } = z
      .object({
        setlistId: z.string().min(1),
        orderedItemIds: z.array(z.string().min(1)).max(500),
      })
      .parse(input);
    const ctx = await ctxForSetlist(setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");

    // Only reorder items that actually belong to this setlist.
    const items = await prisma.setlistItem.findMany({
      where: { setlistId },
      select: { id: true },
    });
    const valid = new Set(items.map((i) => i.id));
    await prisma.$transaction(
      orderedItemIds
        .filter((id) => valid.has(id))
        .map((id, index) =>
          prisma.setlistItem.update({
            where: { id },
            data: { position: index + 1 },
          }),
        ),
    );
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

// ---- Playlist links (§18.12) ----

const PLAYLIST_PLATFORM_ENUM = z.enum([
  "APPLE_MUSIC",
  "SPOTIFY",
  "YOUTUBE",
  "TIDAL",
  "DEEZER",
]);

const setlistLinkSchema = z.object({
  id: z.string().optional(),
  setlistId: z.string().min(1),
  platform: PLAYLIST_PLATFORM_ENUM,
  url: z.string().trim().url("Enter a valid URL.").max(2000),
  label: z.string().trim().max(120).optional(),
});

export async function upsertSetlistLink(
  input: z.infer<typeof setlistLinkSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = setlistLinkSchema.parse(input);
    const ctx = await ctxForSetlist(data.setlistId);
    if (!ctx) return { ok: false, error: "Setlist not found." };
    await requireCapability(user, ctx.entry.actId, "calendar:write");

    const validation = validatePlaylistUrl(data.platform, data.url);
    if (!validation.ok) return { ok: false, error: validation.error };

    if (data.id) {
      await prisma.setlistLink.update({
        where: { id: data.id },
        data: {
          platform: data.platform,
          url: data.url,
          label: data.label || null,
        },
      });
    } else {
      const count = await prisma.setlistLink.count({
        where: { setlistId: data.setlistId },
      });
      await prisma.setlistLink.create({
        data: {
          setlistId: data.setlistId,
          platform: data.platform,
          url: data.url,
          label: data.label || null,
          createdById: user.id,
          sortOrder: count + 1,
        },
      });
    }
    revalidateEntry(ctx.entry.act.slug, ctx.entryId);
    return { ok: true };
  });
}

export async function deleteSetlistLink(input: {
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    const link = await prisma.setlistLink.findUnique({
      where: { id },
      select: {
        setlistId: true,
        setlist: {
          select: {
            entryId: true,
            entry: { select: { actId: true, act: { select: { slug: true } } } },
          },
        },
      },
    });
    if (!link) return { ok: false, error: "Link not found." };
    await requireCapability(user, link.setlist.entry.actId, "calendar:write");
    await prisma.setlistLink.delete({ where: { id } });
    revalidateEntry(link.setlist.entry.act.slug, link.setlist.entryId);
    return { ok: true };
  });
}
