import type { SongPlatform } from "@prisma/client";

/**
 * A normalised track candidate surfaced during resolution / review. Shape is
 * provider-agnostic so it can be persisted as JSON on `SongImportLine` and
 * rendered by the review UI without re-querying.
 */
export type TrackCandidate = {
  title: string;
  artist: string;
  /** iTunes `collectionName`; maps to `Song.album`. */
  album: string | null;
  durationSec: number | null;
  /** ISO date string, when known. */
  releaseDate: string | null;
  appleTrackId: string | null;
  appleCollectionId: string | null;
  /** iTunes `trackViewUrl` — used for the Apple link and as the Odesli input. */
  trackViewUrl: string | null;
  /** 400×400 artwork URL (Apple-hosted, hotlinked). */
  artworkUrl: string | null;
  previewUrl: string | null;
  /** iTunes `primaryGenreName`; a prefill hint only, never authoritative. */
  genre: string | null;
  /** Match score in [0,1], populated during resolution. */
  score: number;
};

/** A resolved streaming link produced by an adapter (Odesli). */
export type ResolvedLink = {
  platform: SongPlatform;
  url: string;
};
