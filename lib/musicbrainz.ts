import { musicbrainzUserAgent } from "./env";

/**
 * Minimal MusicBrainz + Cover Art Archive client for bulk album import.
 *
 * MusicBrainz requires a descriptive User-Agent and rate-limits to ~1 req/sec;
 * imports are manual and admin-triggered so volume stays low. All callers run
 * server-side (no CSP impact). See https://musicbrainz.org/doc/MusicBrainz_API.
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
export const CAA_BASE = "https://coverartarchive.org";
const TIMEOUT_MS = 10_000;

export type MbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ReleaseCandidate = {
  /** MusicBrainz release MBID. */
  id: string;
  title: string;
  artist: string;
  /** Release year (from the release date), when known. */
  year: number | null;
  country: string | null;
  trackCount: number;
  hasCoverArt: boolean;
};

export type ImportTrack = {
  title: string;
  trackNo: number | null;
  durationSec: number | null;
  style: string | null;
};

export type ReleaseTracks = {
  releaseMbid: string;
  album: string;
  artist: string;
  hasCoverArt: boolean;
  tracks: ImportTrack[];
};

// ---- shared fetch ----------------------------------------------------------

async function mbFetch<T>(url: string): Promise<MbResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": musicbrainzUserAgent,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: "Not found." };
      if (res.status === 503) {
        return { ok: false, error: "MusicBrainz is busy. Try again shortly." };
      }
      return { ok: false, error: `MusicBrainz error (${res.status}).` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "MusicBrainz request timed out." };
    }
    return { ok: false, error: "Could not reach MusicBrainz." };
  } finally {
    clearTimeout(timer);
  }
}

// ---- normalisation helpers -------------------------------------------------

type ArtistCredit = { name: string; joinphrase?: string }[];

function joinArtistCredit(credit: ArtistCredit | undefined): string {
  if (!credit?.length) return "";
  return credit.map((c) => `${c.name}${c.joinphrase ?? ""}`).join("").trim();
}

function yearFromDate(date: string | undefined): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

type Genre = { name: string; count?: number };

function topGenre(...lists: (Genre[] | undefined)[]): string | null {
  for (const list of lists) {
    if (!list?.length) continue;
    const best = [...list].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
    if (best?.name) return best.name;
  }
  return null;
}

/**
 * Escape a value for use inside a Lucene phrase in a MusicBrainz query. We wrap
 * the term in quotes, so the main risk is embedded quotes/backslashes.
 */
function luceneEscape(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

// ---- public API ------------------------------------------------------------

type MbReleaseSearch = {
  releases?: {
    id: string;
    title: string;
    date?: string;
    country?: string;
    "track-count"?: number;
    "artist-credit"?: ArtistCredit;
    "cover-art-archive"?: { front?: boolean };
    media?: { "track-count"?: number }[];
  }[];
};

/** Search releases matching an artist + album, best matches first. */
export async function searchReleases(
  artist: string,
  album: string,
): Promise<MbResult<ReleaseCandidate[]>> {
  const query = `release:"${luceneEscape(album)}" AND artist:"${luceneEscape(artist)}"`;
  const url = `${MB_BASE}/release?query=${encodeURIComponent(query)}&limit=25&fmt=json`;
  const res = await mbFetch<MbReleaseSearch>(url);
  if (!res.ok) return res;

  const candidates: ReleaseCandidate[] = (res.data.releases ?? []).map((r) => {
    const trackCount =
      r["track-count"] ??
      (r.media ?? []).reduce((sum, m) => sum + (m["track-count"] ?? 0), 0);
    return {
      id: r.id,
      title: r.title,
      artist: joinArtistCredit(r["artist-credit"]),
      year: yearFromDate(r.date),
      country: r.country ?? null,
      trackCount,
      hasCoverArt: r["cover-art-archive"]?.front === true,
    };
  });

  // Prefer releases that actually list tracks.
  return { ok: true, data: candidates.filter((c) => c.trackCount > 0) };
}

type MbRelease = {
  id: string;
  title: string;
  "artist-credit"?: ArtistCredit;
  "cover-art-archive"?: { front?: boolean; artwork?: boolean };
  genres?: Genre[];
  "release-group"?: { genres?: Genre[] };
  media?: {
    tracks?: {
      position?: number;
      number?: string;
      title: string;
      length?: number | null;
      recording?: { genres?: Genre[] };
    }[];
  }[];
};

/** Fetch a release's full tracklist for import. */
export async function getReleaseTracks(
  mbid: string,
): Promise<MbResult<ReleaseTracks>> {
  const url = `${MB_BASE}/release/${encodeURIComponent(mbid)}?inc=recordings+artist-credits+genres&fmt=json`;
  const res = await mbFetch<MbRelease>(url);
  if (!res.ok) return res;

  const r = res.data;
  const releaseGenres = r["release-group"]?.genres ?? r.genres;
  const tracks: ImportTrack[] = [];
  for (const media of r.media ?? []) {
    for (const t of media.tracks ?? []) {
      const trackNo =
        typeof t.position === "number"
          ? t.position
          : t.number
            ? Number(t.number) || null
            : null;
      tracks.push({
        title: t.title,
        trackNo,
        durationSec:
          typeof t.length === "number" ? Math.round(t.length / 1000) : null,
        style: topGenre(t.recording?.genres, releaseGenres),
      });
    }
  }

  return {
    ok: true,
    data: {
      releaseMbid: r.id,
      album: r.title,
      artist: joinArtistCredit(r["artist-credit"]),
      hasCoverArt:
        r["cover-art-archive"]?.front === true ||
        r["cover-art-archive"]?.artwork === true,
      tracks,
    },
  };
}

/**
 * Build Spotify + Apple Music *search* deep-links for a track. These need no
 * API keys and always resolve; they open a search for the exact track. Both
 * hosts satisfy the SongLink platform host check (spotify / apple).
 */
export function streamingSearchLinks(
  artist: string,
  title: string,
): { platform: "SPOTIFY" | "APPLE_MUSIC"; url: string; label: string }[] {
  const term = `${artist} ${title}`.trim();
  const encoded = encodeURIComponent(term);
  return [
    {
      platform: "SPOTIFY",
      url: `https://open.spotify.com/search/${encoded}`,
      label: "Search on Spotify",
    },
    {
      platform: "APPLE_MUSIC",
      url: `https://music.apple.com/search?term=${encoded}`,
      label: "Search on Apple Music",
    },
  ];
}
