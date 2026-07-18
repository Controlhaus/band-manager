import { prisma } from "./prisma";
import {
  can,
  CAPABILITY_MIN_ROLE,
  higherRole,
  roleAtLeast,
  ROLE_RANK,
  type Capability,
} from "./roles";
import type { ActRole, GlobalRole } from "@prisma/client";

/**
 * Central authorization policy (§4, §9). Every server action / route handler
 * MUST guard through this module. MEMBER capabilities are defined in ONE place
 * (lib/roles.ts CAPABILITY_MIN_ROLE) so the product owner can adjust them
 * alone (§4).
 *
 * Never rely on UI hiding for security.
 */

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type SessionUser = {
  id: string;
  globalRole: GlobalRole;
};

// Re-export pure role helpers so existing imports keep working.
export {
  can,
  CAPABILITY_MIN_ROLE,
  higherRole,
  roleAtLeast,
  ROLE_RANK,
  type Capability,
};

// ---- Guards ----

export function isSuperadmin(user: SessionUser): boolean {
  return user.globalRole === "SUPERADMIN";
}

export function requireSuperadmin(user: SessionUser): void {
  if (!isSuperadmin(user)) {
    throw new AuthorizationError("This action requires a superadmin.");
  }
}

/**
 * Resolve a user's effective role in an act. Superadmins act as ADMIN
 * everywhere. Returns null if the user has no access.
 */
export async function getEffectiveActRole(
  user: SessionUser,
  actId: string,
): Promise<ActRole | null> {
  if (isSuperadmin(user)) return "ADMIN";
  const membership = await prisma.actMembership.findUnique({
    where: { actId_userId: { actId, userId: user.id } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** Throw unless the user has at least `min` role in the act. Returns the role. */
export async function requireActRole(
  user: SessionUser,
  actId: string,
  min: ActRole,
): Promise<ActRole> {
  const role = await getEffectiveActRole(user, actId);
  if (!role || !roleAtLeast(role, min)) {
    throw new AuthorizationError();
  }
  return role;
}

/** Throw unless the user has the given capability in the act. Returns the role. */
export async function requireCapability(
  user: SessionUser,
  actId: string,
  capability: Capability,
): Promise<ActRole> {
  return requireActRole(user, actId, CAPABILITY_MIN_ROLE[capability]);
}

/** Membership check used by the file route (§13.6). */
export async function isActMember(
  user: SessionUser,
  actId: string,
): Promise<boolean> {
  return (await getEffectiveActRole(user, actId)) !== null;
}
