"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { normalizeEmail } from "@/lib/normalize";
import {
  AuthorizationError,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

async function requireUser(): Promise<SessionUser & { id: string }> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

const equipmentItem = z.object({
  name: z.string().trim().max(120),
  category: z.enum(["Instrument", "Amp", "PA", "Lighting", "Cables", "Other"]),
  notes: z.string().trim().max(500).optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  instruments: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  skillLevel: z
    .enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "PROFESSIONAL"])
    .nullable()
    .optional(),
  equipment: z.array(equipmentItem).max(100).default([]),
  bio: z.string().trim().max(2000).optional().default(""),
});

export async function updateProfile(
  input: z.infer<typeof profileSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = profileSchema.parse(input);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { name: data.name },
      }),
      prisma.userProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          instruments: data.instruments,
          skillLevel: data.skillLevel ?? null,
          equipment: data.equipment,
          bio: data.bio || null,
        },
        update: {
          instruments: data.instruments,
          skillLevel: data.skillLevel ?? null,
          equipment: data.equipment,
          bio: data.bio || null,
        },
      }),
    ]);

    revalidatePath("/profile");
    return { ok: true };
  });
}

const statusSchema = z.object({
  songId: z.string().min(1),
  rehearsed: z.boolean().optional(),
  performedCount: z.number().int().min(0).max(100000).optional(),
});

/**
 * Upsert the caller's per-song tracking (§7.2/§7.3). Any member of the song's
 * act (incl. READONLY) may track their own status.
 */
export async function setUserSongStatus(
  input: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId, rehearsed, performedCount } = statusSchema.parse(input);

    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, actId: true },
    });
    if (!song) return { ok: false, error: "Song not found." };
    await requireCapability(user, song.actId, "song:trackOwn");

    const now = new Date();
    const existing = await prisma.userSongStatus.findUnique({
      where: { userId_songId: { userId: user.id, songId } },
    });

    const rehearsedChanged =
      rehearsed !== undefined && rehearsed !== existing?.rehearsed;
    const performedChanged =
      performedCount !== undefined &&
      performedCount !== (existing?.performedCount ?? 0);

    await prisma.userSongStatus.upsert({
      where: { userId_songId: { userId: user.id, songId } },
      create: {
        userId: user.id,
        songId,
        rehearsed: rehearsed ?? false,
        rehearsedAt: rehearsed ? now : null,
        performedCount: performedCount ?? 0,
        lastPerformedAt:
          performedCount && performedCount > 0 ? now : null,
      },
      update: {
        ...(rehearsed !== undefined
          ? { rehearsed, rehearsedAt: rehearsed ? now : null }
          : {}),
        ...(performedCount !== undefined
          ? {
              performedCount,
              lastPerformedAt:
                performedChanged && performedCount >
                (existing?.performedCount ?? 0)
                  ? now
                  : existing?.lastPerformedAt ?? null,
            }
          : {}),
      },
    });

    void rehearsedChanged;
    revalidatePath("/profile");
    return { ok: true };
  });
}

const emailSchema = z.object({
  newEmail: z.string().trim().email("Enter a valid email address."),
});

/**
 * Change the signed-in user's email address. Normalized and checked for
 * uniqueness. Login uses the credential account (keyed by user id), so the new
 * address works immediately.
 */
export async function updateEmail(
  input: z.infer<typeof emailSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AuthorizationError("You must be signed in.");
    const { newEmail } = emailSchema.parse(input);
    const email = normalizeEmail(newEmail);

    if (email === normalizeEmail(session.email)) {
      return { ok: true };
    }
    const taken = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken && taken.id !== session.id) {
      return { ok: false, error: "That email is already in use." };
    }

    await prisma.user.update({
      where: { id: session.id },
      data: { email, emailVerified: true },
    });
    revalidatePath("/profile");
    return { ok: true };
  });
}
