import type { ActRole } from "@prisma/client";

/**
 * Pure, Prisma-free role logic so it can be imported by client components as
 * well as the server-side policy module (lib/permissions.ts).
 */

export const ROLE_RANK: Record<ActRole, number> = {
  READONLY: 1,
  MEMBER: 2,
  ADMIN: 3,
};

export function roleAtLeast(role: ActRole, min: ActRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** The higher of two act roles (used by invitation grant merges, §15.4). */
export function higherRole(a: ActRole, b: ActRole): ActRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

// ---- Capability → minimum act role (single source of truth, §4) ----

export type Capability =
  | "view"
  | "act:edit"
  | "act:manageMembers"
  | "song:write"
  | "calendar:write"
  | "entry:addNotes"
  | "attendance:setOwn"
  | "song:trackOwn"
  | "setlist:write"
  | "booking:manage"
  | "booking:respond";

export const CAPABILITY_MIN_ROLE: Record<Capability, ActRole> = {
  view: "READONLY",
  "attendance:setOwn": "READONLY",
  "song:trackOwn": "READONLY",
  // Poll answers + acknowledgements are open to every member incl. READONLY.
  "booking:respond": "READONLY",
  "song:write": "MEMBER",
  "calendar:write": "MEMBER",
  "entry:addNotes": "MEMBER",
  // Set List library (act-level, reusable) — same tier as song editing.
  "setlist:write": "MEMBER",
  // Create/confirm/cancel bookings — Admin ✓, Member ✓, Readonly ✗ (§17.2).
  "booking:manage": "MEMBER",
  "act:edit": "ADMIN",
  "act:manageMembers": "ADMIN",
};

export function can(role: ActRole, capability: Capability): boolean {
  return roleAtLeast(role, CAPABILITY_MIN_ROLE[capability]);
}
