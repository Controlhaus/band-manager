"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth, createCredentialUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  generateInviteToken,
  hashInviteToken,
  parseGrants,
  INVITE_TTL_MS,
  type InvitationGrant,
} from "@/lib/invitations";
import { sendInvitationEmail } from "@/lib/email";
import {
  AuthorizationError,
  higherRole,
  isSuperadmin,
  requireActRole,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";
import type { SessionUser } from "@/lib/permissions";

const roleEnum = z.enum(["ADMIN", "MEMBER", "READONLY"]);

const createInvitationSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  grants: z
    .array(z.object({ actId: z.string().min(1), role: roleEnum }))
    .min(1, "Select at least one act."),
});

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

/**
 * Validate that the inviter may grant every requested {act, role} (§7.1):
 * superadmins may grant anything; act admins only within acts they administer.
 */
async function assertCanGrant(
  user: SessionUser,
  grants: InvitationGrant[],
): Promise<void> {
  if (isSuperadmin(user)) return;
  for (const g of grants) {
    await requireActRole(user, g.actId, "ADMIN");
  }
}

async function buildInviteLink(rawToken: string): Promise<string> {
  return `${env.appUrl.replace(/\/$/, "")}/invite/${rawToken}`;
}

export async function createInvitation(
  input: z.infer<typeof createInvitationSchema>,
): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { email: rawEmail, grants } = createInvitationSchema.parse(input);
    const email = normalizeEmail(rawEmail);

    await assertCanGrant(user, grants);

    // Validate acts exist; drop any that don't.
    const acts = await prisma.act.findMany({
      where: { id: { in: grants.map((g) => g.actId) } },
      select: { id: true },
    });
    const validActIds = new Set(acts.map((a) => a.id));
    const validGrants = grants.filter((g) => validActIds.has(g.actId));
    if (validGrants.length === 0) {
      return { ok: false, error: "None of the selected acts exist." };
    }

    // Block if a pending, unexpired invite already exists (§15.4).
    const pending = await prisma.invitation.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) {
      return {
        ok: false,
        error:
          "A pending invitation already exists for this email. Resend or revoke it instead.",
      };
    }

    // Block if already a member of every granted act at an equal/higher role.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      const memberships = await prisma.actMembership.findMany({
        where: {
          userId: existingUser.id,
          actId: { in: validGrants.map((g) => g.actId) },
        },
      });
      const coversAll = validGrants.every((g) => {
        const m = memberships.find((x) => x.actId === g.actId);
        return m && higherRole(m.role, g.role) === m.role;
      });
      if (coversAll) {
        return { ok: false, error: "This person is already a member." };
      }
    }

    const { raw, hash } = generateInviteToken();
    await prisma.invitation.create({
      data: {
        email,
        tokenHash: hash,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        grants: validGrants,
      },
    });

    const emailSent = await sendInvitationEmail(email, await buildInviteLink(raw));

    revalidatePath("/admin");
    revalidatePath("/acts");
    return { ok: true, data: { emailSent } };
  });
}

export async function resendInvitation(
  invitationId: string,
): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    const invite = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invite || invite.acceptedAt) {
      return { ok: false, error: "Invitation not found." };
    }
    await assertCanGrant(user, parseGrants(invite.grants));

    // Rotate the token and extend expiry.
    const { raw, hash } = generateInviteToken();
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { tokenHash: hash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    const emailSent = await sendInvitationEmail(
      invite.email,
      await buildInviteLink(raw),
    );
    revalidatePath("/admin");
    return { ok: true, data: { emailSent } };
  });
}

export async function revokeInvitation(
  invitationId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const invite = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invite) return { ok: false, error: "Invitation not found." };
    await assertCanGrant(user, parseGrants(invite.grants));
    await prisma.invitation.delete({ where: { id: invitationId } });
    revalidatePath("/admin");
    return { ok: true };
  });
}

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(10).optional(),
});

/**
 * Accept an invitation (§15.4). Transactional. Existing accounts must be
 * signed in with the matching email; new accounts set name + password.
 */
export async function acceptInvitation(
  input: z.infer<typeof acceptSchema>,
): Promise<ActionResult<{ createdAccount: boolean }>> {
  return runAction<{ createdAccount: boolean }>(async () => {
    const { token, name, password } = acceptSchema.parse(input);
    const invite = await prisma.invitation.findUnique({
      where: { tokenHash: hashInviteToken(token) },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return { ok: false, error: "This invitation is invalid or has expired." };
    }

    const email = normalizeEmail(invite.email);
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      "unknown";
    const rl = await consumeRateLimit("invite_accept", ip, email);
    if (!rl.allowed) {
      return {
        ok: false,
        error: `Too many attempts. Try again in ${rl.retryAfterSeconds} seconds.`,
      };
    }

    const grants = parseGrants(invite.grants);
    // Skip grants for acts that no longer exist (§15.4).
    const acts = await prisma.act.findMany({
      where: { id: { in: grants.map((g) => g.actId) } },
      select: { id: true },
    });
    const liveActIds = new Set(acts.map((a) => a.id));
    const liveGrants = grants.filter((g) => liveActIds.has(g.actId));

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const session = await getSession();
      if (!session || normalizeEmail(session.email) !== email) {
        return {
          ok: false,
          error: `Please sign in as ${email} to accept this invitation.`,
        };
      }
      await applyGrantsAndAccept(existingUser.id, invite.id, liveGrants);
      revalidatePath("/acts");
      return { ok: true, data: { createdAccount: false } };
    }

    // New account path.
    if (!name || !password) {
      return {
        ok: false,
        error: "Enter your name and a password of at least 10 characters.",
      };
    }

    await prisma.$transaction(async (tx) => {
      const created = await createCredentialUser(tx, {
        email,
        name,
        password,
        emailVerified: true, // invite proves ownership (§7.1)
      });
      for (const g of liveGrants) {
        await tx.actMembership.create({
          data: { actId: g.actId, userId: created.id, role: g.role },
        });
      }
      await tx.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });

    // Establish a session for the new user (nextCookies sets the cookie).
    await auth.api
      .signInEmail({ body: { email, password }, headers: hdrs })
      .catch(() => undefined);

    revalidatePath("/acts");
    return { ok: true, data: { createdAccount: true } };
  });
}

/** Upsert memberships keeping the higher role; stamp acceptedAt. */
async function applyGrantsAndAccept(
  userId: string,
  invitationId: string,
  grants: InvitationGrant[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const g of grants) {
      const existing = await tx.actMembership.findUnique({
        where: { actId_userId: { actId: g.actId, userId } },
      });
      if (existing) {
        const role = higherRole(existing.role, g.role);
        if (role !== existing.role) {
          await tx.actMembership.update({
            where: { id: existing.id },
            data: { role },
          });
        }
      } else {
        await tx.actMembership.create({
          data: { actId: g.actId, userId, role: g.role },
        });
      }
    }
    await tx.invitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    });
  });
}
