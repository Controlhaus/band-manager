/**
 * Shared server-side HTTP client for the §18 metadata providers
 * (iTunes Search API, Odesli / song.link, MusicBrainz).
 *
 * Responsibilities:
 *  - Per-provider in-memory token buckets so we stay within each provider's
 *    published rate limits (requests are queued, never dropped).
 *  - A hard request timeout.
 *  - Retry on transient failures (429 / 5xx / network) with exponential
 *    backoff + jitter, honouring `Retry-After`. Client errors (400/401/403/404)
 *    are never retried.
 *  - A read-through cache backed by the `ExternalLookupCache` table so repeated
 *    lookups (e.g. re-resolving the same track) avoid outbound calls.
 *
 * All callers run server-side only — none of these hosts allow browser CORS.
 */

import { ExternalProvider } from "@prisma/client";
import { musicbrainzUserAgent } from "../env";
import { prisma } from "../prisma";

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000;

/** Cache TTL per provider. `null` means the entry never expires. */
const CACHE_TTL_MS: Record<ExternalProvider, number | null> = {
  ITUNES: 30 * 24 * 60 * 60 * 1000, // 30 days
  ODESLI: null, // platform links are effectively permanent
  MUSICBRAINZ: 90 * 24 * 60 * 60 * 1000, // 90 days
  LRCLIB: 180 * 24 * 60 * 60 * 1000, // 180 days
};

export type ExternalResult<T> =
  | { ok: true; data: T; cached: boolean }
  | { ok: false; error: string; status?: number; notFound?: boolean };

// ---- token buckets ---------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simple refill token bucket. `acquire()` calls are serialised through an
 * internal promise chain so concurrent callers can't race past the limit.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly capacity: number,
    /** Tokens replenished per millisecond. */
    private readonly refillPerMs: number,
  ) {
    this.tokens = capacity;
  }

  acquire(): Promise<void> {
    const result = this.tail.then(() => this.take());
    // Keep the chain alive even if a take() somehow rejects (it shouldn't).
    this.tail = result.catch(() => {});
    return result;
  }

  private async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.tokens = Math.min(
        this.capacity,
        this.tokens + (now - this.lastRefill) * this.refillPerMs,
      );
      this.lastRefill = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await sleep(waitMs);
    }
  }
}

// iTunes: 20 req/min, Odesli: 10 req/min, MusicBrainz: 1 req/sec, LRCLIB: 2 req/sec.
const BUCKETS: Record<ExternalProvider, TokenBucket> = {
  ITUNES: new TokenBucket(20, 20 / 60_000),
  ODESLI: new TokenBucket(10, 10 / 60_000),
  MUSICBRAINZ: new TokenBucket(1, 1 / 1_000),
  LRCLIB: new TokenBucket(2, 2 / 1_000),
};

// ---- cache -----------------------------------------------------------------

async function readCache<T>(
  provider: ExternalProvider,
  cacheKey: string,
): Promise<T | null> {
  const row = await prisma.externalLookupCache.findUnique({
    where: { provider_cacheKey: { provider, cacheKey } },
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return row.payload as T;
}

async function writeCache(
  provider: ExternalProvider,
  cacheKey: string,
  payload: unknown,
): Promise<void> {
  const ttl = CACHE_TTL_MS[provider];
  const expiresAt = ttl === null ? null : new Date(Date.now() + ttl);
  const data = {
    payload: payload as object,
    fetchedAt: new Date(),
    expiresAt,
  };
  await prisma.externalLookupCache.upsert({
    where: { provider_cacheKey: { provider, cacheKey } },
    create: { provider, cacheKey, ...data },
    update: data,
  });
}

// ---- retry helpers ---------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function backoffMs(attempt: number, retryAfter: number | null): number {
  if (retryAfter !== null) return retryAfter;
  const base = BASE_BACKOFF_MS * 2 ** attempt;
  return base + Math.floor(Math.random() * 1_000); // jitter
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

// ---- public fetch ----------------------------------------------------------

/**
 * Perform a cached, rate-limited GET returning parsed JSON. `cacheKey` should
 * uniquely identify the request within the provider (usually the full URL).
 */
export async function fetchJson<T>(opts: {
  provider: ExternalProvider;
  url: string;
  cacheKey: string;
  /** Extra request headers (User-Agent + Accept are always set). */
  headers?: Record<string, string>;
}): Promise<ExternalResult<T>> {
  const { provider, url, cacheKey, headers } = opts;

  const cached = await readCache<T>(provider, cacheKey);
  if (cached !== null) return { ok: true, data: cached, cached: true };

  const bucket = BUCKETS[provider];
  let lastError = "Request failed.";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await bucket.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": musicbrainzUserAgent,
          Accept: "application/json",
          ...headers,
        },
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as T;
        await writeCache(provider, cacheKey, data);
        return { ok: true, data, cached: false };
      }

      if (res.status === 404) {
        return { ok: false, error: "Not found.", status: 404, notFound: true };
      }

      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) {
        return {
          ok: false,
          error: `Provider error (${res.status}).`,
          status: res.status,
        };
      }

      lastError = `Provider error (${res.status}).`;
      const wait = backoffMs(attempt, parseRetryAfter(res.headers.get("retry-after")));
      await sleep(wait);
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      lastError = aborted ? "Request timed out." : "Network error.";
      if (attempt === MAX_RETRIES) return { ok: false, error: lastError };
      await sleep(backoffMs(attempt, null));
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, error: lastError };
}
