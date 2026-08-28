/**
 * LRCLIB lyrics adapter — fetches plain lyrics for a song by title/artist
 * (and duration when known). Used by the async LYRICS enrichment job and by the
 * manual "search lyrics online" action.
 *
 * LRCLIB is a free, key-less community API. A miss is not an error: callers
 * treat a `null` result as "no lyrics found" and complete cleanly.
 */

import { fetchJson, type ExternalResult } from "./client";
import { normalizeForMatch } from "../import/normalize";
import { env } from "../env";

const LRCLIB_BASE = "https://lrclib.net/api";

type LrclibRecord = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

export type LyricsCandidate = {
  title: string;
  artist: string;
  album: string | null;
  plainLyrics: string;
};

function cleanLyrics(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * Exact-ish lookup via `/api/get` (title + artist + optional duration). Returns
 * `null` on a miss or an instrumental track.
 */
async function getByMetadata(input: {
  title: string;
  artist: string;
  durationSec: number | null;
}): Promise<string | null> {
  const params = new URLSearchParams({
    track_name: input.title,
    artist_name: input.artist,
  });
  if (input.durationSec != null) params.set("duration", String(input.durationSec));

  const res = await fetchJson<LrclibRecord>({
    provider: "LRCLIB",
    url: `${LRCLIB_BASE}/get?${params.toString()}`,
    cacheKey: `get:${normalizeForMatch(`${input.title} ${input.artist}`)}:${input.durationSec ?? ""}`,
  });
  if (!res.ok || res.data.instrumental) return null;
  return cleanLyrics(res.data.plainLyrics);
}

/** Free-text search via `/api/search`, keeping only records with plain lyrics. */
async function searchRecords(title: string, artist: string): Promise<LrclibRecord[]> {
  const params = new URLSearchParams({ track_name: title });
  if (artist.trim()) params.set("artist_name", artist);

  const res = await fetchJson<LrclibRecord[]>({
    provider: "LRCLIB",
    url: `${LRCLIB_BASE}/search?${params.toString()}`,
    cacheKey: `search:${normalizeForMatch(`${title} ${artist}`)}`,
  });
  if (!res.ok || !Array.isArray(res.data)) return [];
  return res.data.filter((r) => !r.instrumental && cleanLyrics(r.plainLyrics));
}

/**
 * Best-effort plain lyrics for the enrichment job. Tries an exact metadata
 * lookup, then the first search hit. Returns `data: null` when nothing matches.
 */
export async function fetchLyrics(input: {
  title: string;
  artist: string;
  durationSec: number | null;
}): Promise<ExternalResult<string | null>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }

  const exact = await getByMetadata(input);
  if (exact) return { ok: true, data: exact, cached: false };

  const [first] = await searchRecords(input.title, input.artist);
  return { ok: true, data: first ? cleanLyrics(first.plainLyrics) : null, cached: false };
}

/**
 * Search candidates for the manual picker. Returns up to `limit` records that
 * carry plain lyrics, so the user can choose the correct match.
 */
export async function searchLyrics(
  title: string,
  artist: string,
  limit = 8,
): Promise<ExternalResult<LyricsCandidate[]>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }

  const records = await searchRecords(title, artist);
  const candidates: LyricsCandidate[] = records.slice(0, limit).map((r) => ({
    title: r.trackName,
    artist: r.artistName,
    album: r.albumName,
    plainLyrics: r.plainLyrics as string,
  }));
  return { ok: true, data: candidates, cached: false };
}
