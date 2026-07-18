import { prisma } from "./prisma";

/**
 * DB-backed fixed-window rate limiting (§16.3). Survives restarts and is
 * auditable. 5 attempts / 15 minutes per {scope}:{ip}:{email}.
 */

export type RateLimitScope = "login" | "reset" | "invite_accept";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

function bucketKey(scope: RateLimitScope, ip: string, email: string): string {
  return `${scope}:${ip}:${email.toLowerCase()}`;
}

/**
 * Record an attempt and report whether it is allowed. Call this once per
 * attempt BEFORE performing the sensitive operation.
 */
export async function consumeRateLimit(
  scope: RateLimitScope,
  ip: string,
  email: string,
): Promise<RateLimitResult> {
  const key = bucketKey(scope, ip, email);
  const now = new Date();

  const existing = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!existing || now.getTime() - existing.windowStartsAt.getTime() > WINDOW_MS) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, windowStartsAt: now, count: 1 },
      update: { windowStartsAt: now, count: 1 },
    });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_ATTEMPTS) {
    const retryAfterMs =
      WINDOW_MS - (now.getTime() - existing.windowStartsAt.getTime());
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  const updated = await prisma.rateLimitBucket.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return {
    allowed: true,
    remaining: Math.max(0, MAX_ATTEMPTS - updated.count),
    retryAfterSeconds: 0,
  };
}

/** Clear a bucket after a successful operation (optional). */
export async function resetRateLimit(
  scope: RateLimitScope,
  ip: string,
  email: string,
): Promise<void> {
  await prisma.rateLimitBucket
    .delete({ where: { key: bucketKey(scope, ip, email) } })
    .catch(() => undefined);
}
