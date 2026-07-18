"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unlinkStorage } from "@/lib/files";
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

export async function deleteFileAsset(input: {
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { id } = z.object({ id: z.string().min(1) }).parse(input);
    const asset = await prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) return { ok: false, error: "File not found." };

    await requireCapability(
      user,
      asset.actId,
      asset.entityType === "CALENDAR_ENTRY" ? "entry:addNotes" : "song:write",
    );

    await prisma.fileAsset.delete({ where: { id } });
    await unlinkStorage(asset.storagePath);

    const act = await prisma.act.findUnique({
      where: { id: asset.actId },
      select: { slug: true },
    });
    if (act) {
      revalidatePath(`/acts/${act.slug}/songs`);
      revalidatePath(`/acts/${act.slug}/calendar`);
    }
    return { ok: true };
  });
}
