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
