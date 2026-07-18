import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { SessionUser } from "./permissions";
import type { GlobalRole } from "@prisma/client";

export type AppSessionUser = SessionUser & {
  email: string;
  name: string;
  isActive: boolean;
};

/**
 * Shared session accessor (§14.3). ALL server actions and route handlers must
 * obtain the session through this wrapper. Deactivated users are treated as
 * signed out, cutting off existing sessions on their next request.
 */
export const getSession = cache(async (): Promise<AppSessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    globalRole?: GlobalRole;
    isActive?: boolean;
  };

  if (user.isActive === false) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    globalRole: user.globalRole ?? "USER",
    isActive: user.isActive ?? true,
  };
});

/** Require a signed-in user or redirect to /login. */
export async function requireSession(): Promise<AppSessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** Require a superadmin or redirect. */
export async function requireSuperadminSession(): Promise<AppSessionUser> {
  const user = await requireSession();
  if (user.globalRole !== "SUPERADMIN") redirect("/acts");
  return user;
}
