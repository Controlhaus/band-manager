"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  AuthorizationError,
  isSuperadmin,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { higherRole } from "@/lib/roles";
import {
  createNotifications,
  emailNotifications,
  type NotificationInput,
} from "@/lib/notifications";
import { runAction, type ActionResult } from "@/lib/action";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function adminCount(actId: string, excludeUserId?: string): Promise<number> {
  return prisma.actMembership.count({
    where: {
      actId,
      role: "ADMIN",
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}

const roleSchema = z.object({
  actId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER", "READONLY"]),
});

/**
 * Add an existing user to an act directly (no email round trip). Existing
 * memberships are kept at the higher of the two roles. To prevent user
 * enumeration, non-superadmins may only add users who already share an act
 * they administer (the UI picker is scoped the same way).
 */
export async function addMemberToAct(
  input: z.infer<typeof roleSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, userId, role } = roleSchema.parse(input);
    await requireCapability(user, actId, "act:manageMembers");

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!target?.isActive) return { ok: false, error: "User not found." };

    if (!isSuperadmin(user)) {
      const adminActs = await prisma.actMembership.findMany({
        where: { userId: user.id, role: "ADMIN" },
        select: { actId: true },
      });
      const shared = await prisma.actMembership.findFirst({
        where: { userId, actId: { in: adminActs.map((a) => a.actId) } },
        select: { id: true },
      });
      if (!shared) return { ok: false, error: "User not found." };
    }

    const act = await prisma.act.findUnique({
      where: { id: actId },
      select: { slug: true, name: true },
    });
    if (!act) return { ok: false, error: "Act not found." };

    const existing = await prisma.actMembership.findUnique({
      where: { actId_userId: { actId, userId } },
    });
    if (existing) {
      const merged = higherRole(existing.role, role);
      if (merged === existing.role) {
        return {
          ok: false,
          error: "Already a member with this role or higher.",
        };
      }
      await prisma.actMembership.update({
        where: { id: existing.id },
        data: { role: merged },
      });
    } else {
      const notification: NotificationInput = {
        type: "MEMBER_ADDED",
        title: `You've been added to ${act.name}`,
        body: `You are now a ${role.toLowerCase()} of ${act.name} on Band Manager.`,
        linkPath: `/acts/${act.slug}`,
      };
      await prisma.$transaction(async (tx) => {
        await tx.actMembership.create({ data: { actId, userId, role } });
        await createNotifications(tx, [userId], notification);
      });
      await emailNotifications([userId], notification);
    }

    revalidatePath(`/acts/${act.slug}/members`);
    return { ok: true };
  });
}

export async function updateMembershipRole(
  input: z.infer<typeof roleSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, userId, role } = roleSchema.parse(input);
    await requireCapability(user, actId, "act:manageMembers");

    const membership = await prisma.actMembership.findUnique({
      where: { actId_userId: { actId, userId } },
    });
    if (!membership) return { ok: false, error: "Membership not found." };

    // Don't leave an act with no admin.
    if (
      membership.role === "ADMIN" &&
      role !== "ADMIN" &&
      (await adminCount(actId, userId)) === 0
    ) {
      return { ok: false, error: "An act must keep at least one admin." };
    }

    await prisma.actMembership.update({
      where: { actId_userId: { actId, userId } },
      data: { role },
    });
    const act = await prisma.act.findUnique({
      where: { id: actId },
      select: { slug: true },
    });
    if (act) revalidatePath(`/acts/${act.slug}/members`);
    return { ok: true };
  });
}

const removeSchema = z.object({
  actId: z.string().min(1),
  userId: z.string().min(1),
});

export async function removeMembership(
  input: z.infer<typeof removeSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, userId } = removeSchema.parse(input);
    await requireCapability(user, actId, "act:manageMembers");

    const membership = await prisma.actMembership.findUnique({
      where: { actId_userId: { actId, userId } },
    });
    if (!membership) return { ok: false, error: "Membership not found." };

    if (
      membership.role === "ADMIN" &&
      (await adminCount(actId, userId)) === 0
    ) {
      return { ok: false, error: "An act must keep at least one admin." };
    }

    // Historical attendance/status rows are kept (§5); only the membership is
    // removed.
    await prisma.actMembership.delete({
      where: { actId_userId: { actId, userId } },
    });
    const act = await prisma.act.findUnique({
      where: { id: actId },
      select: { slug: true },
    });
    if (act) revalidatePath(`/acts/${act.slug}/members`);
    return { ok: true };
  });
}
