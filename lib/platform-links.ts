/**
 * Hostname allowlist for manually-pasted playlist URLs (§18.12).
 *
 * Playlist links are validated by hostname per platform so a user gets a
 * specific "that's not an Apple Music URL" message rather than a generic
 * invalid-URL error. Used by both setlist link actions.
 */

import type { SongPlatform } from "@prisma/client";

/** Allowed base domains per platform (subdomains are accepted). */
const PLAYLIST_HOSTS: Partial<Record<SongPlatform, string[]>> = {
  APPLE_MUSIC: ["music.apple.com"],
  SPOTIFY: ["open.spotify.com", "spotify.com"],
  YOUTUBE: ["youtube.com", "music.youtube.com"],
  TIDAL: ["tidal.com"],
  DEEZER: ["deezer.com"],
};

/** Platforms that accept a manual playlist link, in display order. */
export const PLAYLIST_PLATFORMS = Object.keys(PLAYLIST_HOSTS) as SongPlatform[];

/** The subset of SongPlatform that accepts a manual playlist link. */
export type PlaylistPlatform =
  | "APPLE_MUSIC"
  | "SPOTIFY"
  | "YOUTUBE"
  | "TIDAL"
  | "DEEZER";

export const PLATFORM_LABEL: Record<SongPlatform, string> = {
  APPLE_MUSIC: "Apple Music",
  SPOTIFY: "Spotify",
  YOUTUBE: "YouTube",
  TIDAL: "Tidal",
  DEEZER: "Deezer",
  AMAZON_MUSIC: "Amazon Music",
  SOUNDCLOUD: "SoundCloud",
  SONGLINK: "Songlink",
  OTHER: "Other",
};

function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((base) => host === base || host.endsWith(`.${base}`));
}

/** All allowed playlist hosts, flattened (for platform-less validation). */
const ALL_PLAYLIST_HOSTS = Object.values(PLAYLIST_HOSTS).flat();

export type UrlValidation = { ok: true } | { ok: false; error: string };

/** Validate a per-platform playlist URL against its hostname allowlist. */
export function validatePlaylistUrl(
  platform: SongPlatform,
  url: string,
): UrlValidation {
  const allowed = PLAYLIST_HOSTS[platform];
  const label = PLATFORM_LABEL[platform];
  if (!allowed) {
    return { ok: false, error: `${label} playlist links aren't supported.` };
  }
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (!hostMatches(host, allowed)) {
    return {
      ok: false,
      error: `That doesn't look like a ${label} URL (expected ${allowed[0]}).`,
    };
  }
  return { ok: true };
}

/** Validate a platform-agnostic playlist URL (reusable SetList library). */
export function validateAnyPlaylistUrl(url: string): UrlValidation {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (!hostMatches(host, ALL_PLAYLIST_HOSTS)) {
    return {
      ok: false,
      error:
        "Only Apple Music, Spotify, YouTube, Tidal or Deezer playlist links are allowed.",
    };
  }
  return { ok: true };
}
