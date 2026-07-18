"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  AuthorizationError,
  requireSuperadmin,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

async function requireSuperadminUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  requireSuperadmin(session);
  return session;
}

/** Number of OTHER active superadmins (excludes the given user). */
async function otherActiveSuperadmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: {
      id: { not: excludeUserId },
      globalRole: "SUPERADMIN",
      isActive: true,
    },
  });
}

const roleSchema = z.object({
  userId: z.string().min(1),
  globalRole: z.enum(["SUPERADMIN", "USER"]),
});

export async function updateUserGlobalRole(
  input: z.infer<typeof roleSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireSuperadminUser();
    const { userId, globalRole } = roleSchema.parse(input);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { ok: false, error: "User not found." };

    // Demotion guards (§15.3).
    if (target.globalRole === "SUPERADMIN" && globalRole === "USER") {
      if (userId === admin.id) {
        return {
          ok: false,
          error: "You can't demote yourself. Ask another superadmin.",
        };
      }
      if ((await otherActiveSuperadmins(userId)) === 0) {
        return {
          ok: false,
          error: "At least one active superadmin is required.",
        };
      }
    }

    await prisma.user.update({ where: { id: userId }, data: { globalRole } });
    revalidatePath("/admin");
    return { ok: true };
  });
}

const activeSchema = z.object({
  userId: z.string().min(1),
  isActive: z.boolean(),
});

export async function setUserActive(
  input: z.infer<typeof activeSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireSuperadminUser();
    const { userId, isActive } = activeSchema.parse(input);

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { ok: false, error: "User not found." };

    if (!isActive) {
      if (userId === admin.id) {
        return { ok: false, error: "You can't deactivate yourself." };
      }
      if (
        target.globalRole === "SUPERADMIN" &&
        (await otherActiveSuperadmins(userId)) === 0
      ) {
        return {
          ok: false,
          error: "At least one active superadmin is required.",
        };
      }
    }

    await prisma.user.update({ where: { id: userId }, data: { isActive } });
    // Also drop their active sessions when deactivating.
    if (!isActive) {
      await prisma.session.deleteMany({ where: { userId } });
    }
    revalidatePath("/admin");
    return { ok: true };
  });
}

const deleteSchema = z.object({ userId: z.string().min(1) });

export async function deleteUser(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireSuperadminUser();
    const { userId } = deleteSchema.parse(input);

    if (userId === admin.id) {
      return { ok: false, error: "You can't delete your own account." };
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { ok: false, error: "User not found." };

    if (
      target.globalRole === "SUPERADMIN" &&
      (await otherActiveSuperadmins(userId)) === 0
    ) {
      return { ok: false, error: "At least one active superadmin is required." };
    }

    // Cascade removes memberships/profile/statuses/attendance/sessions;
    // authorship FKs are SetNull (§16.1). Also revoke invites to their email.
    await prisma.$transaction([
      prisma.invitation.deleteMany({
        where: { email: target.email, acceptedAt: null },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    revalidatePath("/admin");
    return { ok: true };
  });
}
