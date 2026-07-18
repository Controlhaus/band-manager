import { createHash, randomBytes } from "node:crypto";
import type { ActRole } from "@prisma/client";

/**
 * Invitation token helpers (§15.4). A 32-byte random token is emailed
 * base64url-encoded; only its SHA-256 hash is stored. Raw tokens are never
 * persisted or logged.
 */

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInviteToken(raw) };
}

export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (§7.1)

export type InvitationGrant = { actId: string; role: ActRole };

/** Parse/validate the `grants` JSON stored on an Invitation row. */
export function parseGrants(value: unknown): InvitationGrant[] {
  if (!Array.isArray(value)) return [];
  const roles: ActRole[] = ["ADMIN", "MEMBER", "READONLY"];
  return value.flatMap((g) => {
    if (
      g &&
      typeof g === "object" &&
      "actId" in g &&
      "role" in g &&
      typeof (g as { actId: unknown }).actId === "string" &&
      roles.includes((g as { role: ActRole }).role)
    ) {
      return [{ actId: (g as { actId: string }).actId, role: (g as { role: ActRole }).role }];
    }
    return [];
  });
}
