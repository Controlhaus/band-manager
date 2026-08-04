/**
 * Odesli / song.link adapter (§18.6).
 *
 * Given a known Apple track URL, Odesli returns the matching links across other
 * streaming platforms. We only trust Odesli for cross-platform links (Spotify,
 * YouTube Music, Tidal, Deezer, Amazon Music) plus the shareable song.link page.
 *
 * Docs: https://odesli.co / https://www.notion.so/API-d0ebe08a5e304a55928405eb682f6741
 */

import type { SongPlatform } from "@prisma/client";
import { env } from "../env";
import { fetchJson, type ExternalResult } from "./client";
import type { ResolvedLink } from "./types";

const API_URL = "https://api.song.link/v1-alpha.1/links";

type OdesliLink = { url?: string };

type OdesliResponse = {
  pageUrl?: string;
  linksByPlatform?: Record<string, OdesliLink | undefined>;
};

/**
 * Map Odesli platform keys to our {@link SongPlatform} enum. YouTube Music is
 * preferred over plain YouTube; both fold into `YOUTUBE`.
 */
const PLATFORM_MAP: Array<{ keys: string[]; platform: SongPlatform }> = [
  { keys: ["spotify"], platform: "SPOTIFY" },
  { keys: ["youtubeMusic", "youtube"], platform: "YOUTUBE" },
  { keys: ["tidal"], platform: "TIDAL" },
  { keys: ["deezer"], platform: "DEEZER" },
  { keys: ["amazonMusic"], platform: "AMAZON_MUSIC" },
];

/**
 * Resolve cross-platform streaming links for an Apple track URL. Returns links
 * in a stable order; the song.link page (`SONGLINK`) is always last when present.
 */
export async function resolveLinks(
  appleTrackUrl: string,
): Promise<ExternalResult<ResolvedLink[]>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }
  const params = new URLSearchParams({
    url: appleTrackUrl,
    userCountry: env.odesliCountry,
  });
  if (env.odesliApiKey) params.set("key", env.odesliApiKey);
  const url = `${API_URL}?${params.toString()}`;

  // Cache key omits the (optional, secret) API key so keyed/keyless share cache.
  const cacheKey = `url:${appleTrackUrl}:${env.odesliCountry}`;

  const res = await fetchJson<OdesliResponse>({
    provider: "ODESLI",
    url,
    cacheKey,
  });
  if (!res.ok) return res;

  const byPlatform = res.data.linksByPlatform ?? {};
  const links: ResolvedLink[] = [];
  for (const { keys, platform } of PLATFORM_MAP) {
    for (const key of keys) {
      const link = byPlatform[key]?.url;
      if (link) {
        links.push({ platform, url: link });
        break; // first matching key wins (e.g. youtubeMusic over youtube)
      }
    }
  }
  if (res.data.pageUrl) {
    links.push({ platform: "SONGLINK", url: res.data.pageUrl });
  }
  return { ok: true, data: links, cached: res.cached };
}
