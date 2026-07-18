import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendPasswordResetEmail } from "./email";
import { consumeRateLimit } from "./rate-limit";
import type { GlobalRole } from "@prisma/client";

function clientIp(headers: Headers | undefined): string {
  const fwd = headers?.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return headers?.get("x-real-ip") ?? "unknown";
}

/**
 * better-auth server instance (§3, §14.3).
 * - Public signup is disabled; accounts are created only via acceptInvitation.
 * - Inactive users are rejected at session creation (sign-in) and again in the
 *   getSession wrapper (lib/session.ts).
 */
export const auth = betterAuth({
  appName: "Band Manager",
  baseURL: env.appUrl,
  secret: env.betterAuthSecret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },
  user: {
    additionalFields: {
      globalRole: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "USER",
      },
      isActive: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Hard-block public signup (§7.1 / §14.3). Accounts are created only via
      // acceptInvitation, which uses createCredentialUser directly (not this
      // endpoint). disableSignUp alone is not reliably enforced, so we reject
      // the route explicitly.
      if (ctx.path.startsWith("/sign-up")) {
        throw new APIError("FORBIDDEN", {
          message: "Public signup is disabled. You need an invitation.",
        });
      }

      // DB-backed rate limiting on login and password reset (§16.3).
      const scope =
        ctx.path === "/sign-in/email"
          ? "login"
          : ctx.path === "/forget-password"
            ? "reset"
            : null;
      if (!scope) return;
      const email = String(
        (ctx.body as { email?: string } | undefined)?.email ?? "",
      );
      if (!email) return;
      const result = await consumeRateLimit(scope, clientIp(ctx.headers), email);
      if (!result.allowed) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
        });
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          if (!user?.isActive) {
            throw new APIError("FORBIDDEN", {
              message: "This account has been deactivated.",
            });
          }
          return { data: session };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

/**
 * Create a credential-backed user directly (bypassing the disabled public
 * signup endpoint) using better-auth's configured password hasher, so sign-in
 * works consistently. Used by acceptInvitation and the bootstrap seed.
 *
 * Runs inside the provided transaction client for the User + Account rows;
 * the password is hashed before the transaction opens.
 */
export async function createCredentialUser(
  tx: Pick<typeof prisma, "user" | "account">,
  args: {
    email: string;
    name: string;
    password: string;
    globalRole?: GlobalRole;
    emailVerified?: boolean;
  },
): Promise<{ id: string }> {
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(args.password);

  const user = await tx.user.create({
    data: {
      email: args.email,
      name: args.name,
      emailVerified: args.emailVerified ?? false,
      globalRole: args.globalRole ?? "USER",
      isActive: true,
      profile: { create: {} },
    },
    select: { id: true },
  });

  await tx.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    },
  });

  return user;
}
