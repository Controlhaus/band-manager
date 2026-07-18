import { prisma } from "@/lib/prisma";
import { getEffectiveActRole, isSuperadmin } from "@/lib/permissions";
import type { SessionUser } from "@/lib/permissions";
import type { ActRole } from "@prisma/client";

export type UserAct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: ActRole;
};

/** Acts the user can access, with their effective role. Superadmins see all. */
export async function getUserActs(user: SessionUser): Promise<UserAct[]> {
  if (isSuperadmin(user)) {
    const acts = await prisma.act.findMany({ orderBy: { name: "asc" } });
    return acts.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      description: a.description,
      role: "ADMIN" as ActRole,
    }));
  }
  const memberships = await prisma.actMembership.findMany({
    where: { userId: user.id },
    include: { act: true },
    orderBy: { act: { name: "asc" } },
  });
  return memberships.map((m) => ({
    id: m.act.id,
    name: m.act.name,
    slug: m.act.slug,
    description: m.act.description,
    role: m.role,
  }));
}

export type LoadedAct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  role: ActRole;
};

/** Load an act by slug, returning the viewer's role, or null if no access. */
export async function loadActForUser(
  user: SessionUser,
  slug: string,
): Promise<LoadedAct | null> {
  const act = await prisma.act.findUnique({ where: { slug } });
  if (!act) return null;
  const role = await getEffectiveActRole(user, act.id);
  if (!role) return null;
  return {
    id: act.id,
    name: act.name,
    slug: act.slug,
    description: act.description,
    timezone: act.timezone,
    role,
  };
}
