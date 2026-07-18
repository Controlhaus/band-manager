"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import { generateInviteToken } from "@/lib/invitations";
import { AuthorizationError } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

/**
 * Calendar feed token management (§17.4). Uses the same 32-byte random +
 * SHA-256-at-rest pattern as invitations (§15.4). Regenerating revokes the old.
 */

export async function rotateCalendarFeedToken(): Promise<
  ActionResult<{ url: string }>
> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AuthorizationError("You must be signed in.");
    const { raw, hash } = generateInviteToken();
    await prisma.calendarFeedToken.upsert({
      where: { userId: session.id },
      create: { userId: session.id, tokenHash: hash },
      update: { tokenHash: hash },
    });
    const url = `${env.appUrl.replace(/\/$/, "")}/api/ics/${raw}`;
    revalidatePath("/profile");
    return { ok: true, data: { url } };
  });
}

export async function revokeCalendarFeedToken(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AuthorizationError("You must be signed in.");
    await prisma.calendarFeedToken
      .delete({ where: { userId: session.id } })
      .catch(() => undefined);
    revalidatePath("/profile");
    return { ok: true };
  });
}
