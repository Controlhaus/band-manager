/**
 * iTunes Search API adapter (§18.5).
 *
 * The iTunes Search API is keyless, server-side only (no CORS), and is the
 * primary source of canonical track metadata + preview/artwork. We use it for
 * both free-text search (resolution) and id lookup (re-resolution).
 *
 * Docs: https://performance-partners.apple.com/search-api
 */

import { env } from "../env";
import { fetchJson, type ExternalResult } from "./client";
import { normalizeForMatch } from "../import/normalize";
import type { TrackCandidate } from "./types";

const SEARCH_URL = "https://itunes.apple.com/search";
const LOOKUP_URL = "https://itunes.apple.com/lookup";
const SEARCH_LIMIT = 8;

type ITunesTrack = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  isStreamable?: boolean;
};

type ITunesResponse = {
  resultCount: number;
  results: ITunesTrack[];
};

/** Upscale the standard 100×100 artwork URL to 400×400. */
function artwork400(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/400x400bb.$1");
}

function toCandidate(t: ITunesTrack): TrackCandidate | null {
  // Only song tracks carry a preview / usable metadata.
  if (t.kind && t.kind !== "song") return null;
  if (!t.trackName || !t.artistName) return null;
  return {
    title: t.trackName,
    artist: t.artistName,
    album: t.collectionName ?? null,
    durationSec:
      typeof t.trackTimeMillis === "number"
        ? Math.round(t.trackTimeMillis / 1000)
        : null,
    releaseDate: t.releaseDate ?? null,
    appleTrackId: t.trackId != null ? String(t.trackId) : null,
    appleCollectionId: t.collectionId != null ? String(t.collectionId) : null,
    trackViewUrl: t.trackViewUrl ?? null,
    artworkUrl: artwork400(t.artworkUrl100),
    previewUrl: t.previewUrl ?? null,
    genre: t.primaryGenreName ?? null,
    score: 0,
  };
}

/** Free-text song search. Returns up to {@link SEARCH_LIMIT} candidates. */
export async function searchTracks(
  term: string,
): Promise<ExternalResult<TrackCandidate[]>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }
  const params = new URLSearchParams({
    term,
    entity: "song",
    media: "music",
    limit: String(SEARCH_LIMIT),
    country: env.itunesStorefront,
  });
  const url = `${SEARCH_URL}?${params.toString()}`;
  const res = await fetchJson<ITunesResponse>({
    provider: "ITUNES",
    url,
    cacheKey: `search:${normalizeForMatch(term)}:${env.itunesStorefront}`,
  });
  if (!res.ok) return res;
  const candidates = res.data.results
    .map(toCandidate)
    .filter((c): c is TrackCandidate => c !== null);
  return { ok: true, data: candidates, cached: res.cached };
}

/** Look up a single track by its iTunes track id (used for re-resolution). */
export async function lookupTrack(
  appleTrackId: string,
): Promise<ExternalResult<TrackCandidate | null>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }
  const params = new URLSearchParams({
    id: appleTrackId,
    entity: "song",
    country: env.itunesStorefront,
  });
  const url = `${LOOKUP_URL}?${params.toString()}`;
  const res = await fetchJson<ITunesResponse>({
    provider: "ITUNES",
    url,
    cacheKey: `lookup:${appleTrackId}`,
  });
  if (!res.ok) return res;
  const first = res.data.results.map(toCandidate).find((c) => c !== null) ?? null;
  return { ok: true, data: first, cached: res.cached };
}
