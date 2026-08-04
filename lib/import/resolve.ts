/**
 * Resolution & scoring (§18.9). Turns a `ParsedLine` into scored iTunes
 * candidates and a classification (`RESOLVED` / `NO_MATCH` / `ERROR`).
 *
 * The scoring + classification + dedupe helpers are pure and unit-tested; only
 * `resolveParsedLine` performs I/O (through the throttled iTunes adapter).
 */

import type { ImportLineState } from "@prisma/client";
import { searchTracks } from "../external/itunes";
import type { TrackCandidate } from "../external/types";
import type { ParsedLine } from "./parse";
import { normalizeForMatch, normalizedContains, similarity } from "./normalize";

// Scoring weights (§18.9 step 3).
const W_TITLE = 0.45;
const W_ARTIST = 0.35;
const W_ALBUM = 0.1;
const W_RANK = 0.1;

// Classification thresholds (§18.9 step 4).
export const STRONG_SCORE = 0.85;
export const STRONG_GAP = 0.15;
export const PLAUSIBLE_SCORE = 0.55;

export type ResolveOutcome = {
  /** Scored candidates, highest first, capped at 8. */
  candidates: TrackCandidate[];
  /** Pre-selected candidate index, or null when the user must choose. */
  selectedCandidateIdx: number | null;
  state: Extract<ImportLineState, "RESOLVED" | "NO_MATCH" | "ERROR">;
  errorMessage: string | null;
};

/** Score a single candidate for a given title/artist interpretation. */
export function scoreCandidate(
  candidate: TrackCandidate,
  parsedTitle: string,
  parsedArtist: string | null,
  albumHint: string | null,
  index: number,
): number {
  const titleScore = similarity(candidate.title, parsedTitle);
  const artistScore = parsedArtist
    ? similarity(candidate.artist, parsedArtist)
    : 0;
  const albumScore =
    albumHint && candidate.album && normalizedContains(candidate.album, albumHint)
      ? 1
      : 0;
  const rankBonus = 1 - index / 8;
  return (
    titleScore * W_TITLE +
    artistScore * W_ARTIST +
    albumScore * W_ALBUM +
    rankBonus * W_RANK
  );
}

/** Classify a scored, sorted candidate list into a review outcome. */
export function classify(candidates: TrackCandidate[]): ResolveOutcome {
  if (candidates.length === 0) {
    return {
      candidates,
      selectedCandidateIdx: null,
      state: "NO_MATCH",
      errorMessage: null,
    };
  }
  const top = candidates[0]!.score;

  if (top >= STRONG_SCORE) {
    // gap >= STRONG_GAP → collapsed; gap < STRONG_GAP → expanded "similar
    // matches". Both pre-select the top candidate; the distinction is a UI hint
    // the review page derives from the scores.
    return { candidates, selectedCandidateIdx: 0, state: "RESOLVED", errorMessage: null };
  }
  if (top >= PLAUSIBLE_SCORE) {
    return { candidates, selectedCandidateIdx: null, state: "RESOLVED", errorMessage: null };
  }
  return { candidates, selectedCandidateIdx: null, state: "NO_MATCH", errorMessage: null };
}

type Interpretation = { title: string; artist: string | null };

function interpretations(parsed: ParsedLine): Interpretation[] {
  const primary: Interpretation = {
    title: parsed.parsedTitle,
    artist: parsed.parsedArtist,
  };
  if (parsed.hadSeparator && parsed.parsedArtist) {
    return [primary, { title: parsed.parsedArtist, artist: parsed.parsedTitle }];
  }
  return [primary];
}

/**
 * Resolve a parsed line against iTunes, querying both orderings when a
 * separator was present and merging candidates by iTunes track id.
 */
export async function resolveParsedLine(
  parsed: ParsedLine,
): Promise<ResolveOutcome> {
  const merged = new Map<string, TrackCandidate>();
  let anySuccess = false;
  let errorMessage: string | null = null;

  for (const interp of interpretations(parsed)) {
    const term = `${interp.artist ?? ""} ${interp.title}`.trim();
    const res = await searchTracks(term);
    if (!res.ok) {
      errorMessage = res.error;
      continue;
    }
    anySuccess = true;
    res.data.forEach((cand, index) => {
      const score = scoreCandidate(
        cand,
        interp.title,
        interp.artist,
        parsed.parsedAlbumHint,
        index,
      );
      const key = cand.appleTrackId ?? `${cand.title}|${cand.artist}`;
      const existing = merged.get(key);
      if (!existing || score > existing.score) {
        merged.set(key, { ...cand, score });
      }
    });
  }

  if (!anySuccess && errorMessage) {
    return {
      candidates: [],
      selectedCandidateIdx: null,
      state: "ERROR",
      errorMessage,
    };
  }

  const candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  return classify(candidates);
}

/**
 * Pure dedupe check (§18.9 step 1): find an existing song in the act whose
 * normalized title + artist matches the parsed line in either ordering.
 */
export function findDuplicate(
  parsed: ParsedLine,
  songs: ReadonlyArray<{ id: string; title: string; artist: string | null }>,
): string | null {
  const title = normalizeForMatch(parsed.parsedTitle);
  const artist = parsed.parsedArtist ? normalizeForMatch(parsed.parsedArtist) : "";
  const pairs: Array<[string, string]> = [[title, artist]];
  if (parsed.hadSeparator && artist) pairs.push([artist, title]);

  for (const song of songs) {
    const songTitle = normalizeForMatch(song.title);
    const songArtist = song.artist ? normalizeForMatch(song.artist) : "";
    for (const [pt, pa] of pairs) {
      if (songTitle === pt && songArtist === pa) return song.id;
    }
  }
  return null;
}
