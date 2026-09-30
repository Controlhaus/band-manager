"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
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

// ---------------------------------------------------------------------------
// Invite acceptance (§15.4) — progressive-enhancement form actions.
// Bound directly to <form action> so the invite page works without client JS
// (in-app email browsers frequently fail to hydrate). Errors surface via an
// ?error= code on the invite page; success redirects to /acts.
// ---------------------------------------------------------------------------

export type InviteErrorCode =
  | "invalid"
  | "rate-limited"
  | "wrong-account"
  | "bad-password"
  | "password-short"
  | "password-mismatch"
  | "name-required"
  | "have-account"
  | "generic";

function inviteErrorRedirect(token: string, code: InviteErrorCode): never {
  redirect(`/invite/${encodeURIComponent(token)}?error=${code}`);
}

type LoadedInvite = {
  inviteId: string;
  email: string;
  liveGrants: InvitationGrant[];
};

/** Validate token + rate limit and resolve still-existing act grants. */
async function loadInviteForAccept(
  token: string,
): Promise<LoadedInvite | InviteErrorCode> {
  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return "invalid";
  }

  const email = normalizeEmail(invite.email);
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";
  const rl = await consumeRateLimit("invite_accept", ip, email);
  if (!rl.allowed) return "rate-limited";

  const grants = parseGrants(invite.grants);
  // Skip grants for acts that no longer exist (§15.4).
  const acts = await prisma.act.findMany({
    where: { id: { in: grants.map((g) => g.actId) } },
    select: { id: true },
  });
  const liveActIds = new Set(acts.map((a) => a.id));
  return {
    inviteId: invite.id,
    email,
    liveGrants: grants.filter((g) => liveActIds.has(g.actId)),
  };
}

/** Case 1: existing account, already signed in with the invited email. */
export async function acceptInviteSignedInAction(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/login");

  let error: InviteErrorCode | null = null;
  try {
    const loaded = await loadInviteForAccept(token);
    if (typeof loaded === "string") {
      error = loaded;
    } else {
      const session = await getSession();
      if (!session || normalizeEmail(session.email) !== loaded.email) {
        error = "wrong-account";
      } else {
        await applyGrantsAndAccept(session.id, loaded.inviteId, loaded.liveGrants);
      }
    }
  } catch (err) {
    console.error("[invite] signed-in accept failed:", err);
    error = "generic";
  }
  if (error) inviteErrorRedirect(token, error);
  revalidatePath("/acts");
  redirect("/acts");
}

/** Case 2: existing account, not signed in — sign in and accept in one step. */
export async function signInAndAcceptAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token) redirect("/login");

  let error: InviteErrorCode | null = null;
  try {
    const loaded = await loadInviteForAccept(token);
    if (typeof loaded === "string") {
      error = loaded;
    } else if (!password) {
      error = "bad-password";
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { email: loaded.email },
        select: { id: true },
      });
      if (!existingUser) {
        error = "invalid";
      } else {
        try {
          // nextCookies sets the session cookie from this server-side call.
          await auth.api.signInEmail({
            body: { email: loaded.email, password },
            headers: await headers(),
          });
        } catch (err) {
          error =
            err instanceof APIError && err.status === "TOO_MANY_REQUESTS"
              ? "rate-limited"
              : "bad-password";
        }
        if (!error) {
          await applyGrantsAndAccept(
            existingUser.id,
            loaded.inviteId,
            loaded.liveGrants,
          );
        }
      }
    }
  } catch (err) {
    console.error("[invite] sign-in accept failed:", err);
    error = "generic";
  }
  if (error) inviteErrorRedirect(token, error);
  revalidatePath("/acts");
  redirect("/acts");
}

/** Case 3: no account yet — create it, apply grants, sign in. */
export async function createAccountAndAcceptAction(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!token) redirect("/login");

  let error: InviteErrorCode | null = null;
  try {
    const loaded = await loadInviteForAccept(token);
    if (typeof loaded === "string") {
      error = loaded;
    } else if (
      await prisma.user.findUnique({
        where: { email: loaded.email },
        select: { id: true },
      })
    ) {
      error = "have-account";
    } else if (!name || name.length > 120) {
      error = "name-required";
    } else if (password.length < 10) {
      error = "password-short";
    } else if (password !== confirm) {
      error = "password-mismatch";
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await createCredentialUser(tx, {
          email: loaded.email,
          name,
          password,
          emailVerified: true, // invite proves ownership (§7.1)
        });
        for (const g of loaded.liveGrants) {
          await tx.actMembership.create({
            data: { actId: g.actId, userId: created.id, role: g.role },
          });
        }
        await tx.invitation.update({
          where: { id: loaded.inviteId },
          data: { acceptedAt: new Date() },
        });
      });

      // Establish a session for the new user (nextCookies sets the cookie).
      await auth.api
        .signInEmail({
          body: { email: loaded.email, password },
          headers: await headers(),
        })
        .catch(() => undefined);
    }
  } catch (err) {
    console.error("[invite] account creation failed:", err);
    error = "generic";
  }
  if (error) inviteErrorRedirect(token, error);
  revalidatePath("/acts");
  redirect("/acts");
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
