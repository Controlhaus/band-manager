"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { AuthorizationError } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

export async function markNotificationRead(input: {
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AuthorizationError("You must be signed in.");
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    // Scope to the caller so you can only mark your own.
    await prisma.notification.updateMany({
      where: { id, userId: session.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true };
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const session = await getSession();
    if (!session) throw new AuthorizationError("You must be signed in.");
    await prisma.notification.updateMany({
      where: { userId: session.id, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { ok: true };
  });
}
