"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";
import { slugifyName } from "@/lib/normalize";
import { isValidTimeZone } from "@/lib/tz";
import { removeActStorage } from "@/lib/files";
import {
  AuthorizationError,
  requireCapability,
  requireSuperadmin,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

/** Generate a unique slug, appending -2, -3, … on collision (§14.7). */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyName(name);
  let candidate = base;
  let n = 1;
  for (;;) {
    const existing = await prisma.act.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().optional(),
});

export async function createAct(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const { name, description, timezone } = createSchema.parse(input);
    const tz = timezone && isValidTimeZone(timezone) ? timezone : env.defaultTz;
    const slug = await uniqueSlug(name);
    await prisma.act.create({
      data: {
        name,
        slug,
        description: description || null,
        timezone: tz,
        createdById: user.id,
      },
    });
    revalidatePath("/admin");
    revalidatePath("/acts");
    return { ok: true, data: { slug } };
  });
}

const updateSchema = z.object({
  actId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(2000).optional(),
  timezone: z.string().trim().min(1, "Timezone is required."),
});

export async function updateAct(
  input: z.infer<typeof updateSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, name, description, timezone } = updateSchema.parse(input);
    await requireCapability(user, actId, "act:edit");
    if (!isValidTimeZone(timezone)) {
      return { ok: false, error: "Enter a valid IANA timezone." };
    }
    const act = await prisma.act.update({
      where: { id: actId },
      // Slug is immutable after creation (§14.7); only name changes.
      data: { name, description: description || null, timezone },
      select: { slug: true },
    });
    revalidatePath(`/acts/${act.slug}/settings`);
    revalidatePath(`/acts/${act.slug}`);
    return { ok: true };
  });
}

const deleteSchema = z.object({
  actId: z.string().min(1),
  confirmName: z.string(),
});

export async function deleteAct(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    requireSuperadmin(user);
    const { actId, confirmName } = deleteSchema.parse(input);
    const act = await prisma.act.findUnique({ where: { id: actId } });
    if (!act) return { ok: false, error: "Act not found." };
    if (confirmName.trim() !== act.name) {
      return { ok: false, error: "The typed name does not match." };
    }
    // Cascade removes all relational data; polymorphic FileAssets + disk files
    // are cleaned up explicitly (§14.4).
    await prisma.$transaction([
      prisma.fileAsset.deleteMany({ where: { actId } }),
      prisma.act.delete({ where: { id: actId } }),
    ]);
    await removeActStorage(actId);
    revalidatePath("/admin");
    revalidatePath("/acts");
    return { ok: true };
  });
}
