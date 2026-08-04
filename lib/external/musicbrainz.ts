/**
 * Recording-level MusicBrainz adapter (§18.7) — used by the async enrichment
 * job to backfill ISRC, MB recording/work ids and songwriter credits.
 *
 * This is distinct from `lib/musicbrainz.ts` (album-level bulk import). It runs
 * only from the throttled enrichment runner (1 req/sec via the shared bucket).
 * A miss is not an error: the job completes as a no-op.
 */

import { fetchJson, type ExternalResult } from "./client";
import { normalizeForMatch } from "../import/normalize";
import { env } from "../env";

const MB_BASE = "https://musicbrainz.org/ws/2";
/** Minimum MB search score to accept a recording match. */
const MIN_SCORE = 90;
/** Max allowed duration difference (seconds) when a duration is known. */
const DURATION_TOLERANCE_S = 5;
/** MB relationship types that denote a songwriter credit (§18.7). */
const WRITER_TYPES = new Set(["composer", "lyricist"]);

export type MbEnrichment = {
  mbRecordingId: string | null;
  mbWorkId: string | null;
  isrc: string | null;
  writers: string[];
};

function luceneEscape(value: string): string {
  return value.replace(/(["\\])/g, "\\$1");
}

type MbArtistCredit = { name: string; joinphrase?: string }[];
type MbRelation = {
  type?: string;
  work?: { id?: string };
  artist?: { name?: string };
};
type MbRecording = {
  id: string;
  score?: number;
  length?: number | null;
  isrcs?: string[];
  "artist-credit"?: MbArtistCredit;
  relations?: MbRelation[];
};

// ---- ISRC tier -------------------------------------------------------------

type MbIsrcResponse = { recordings?: MbRecording[] };

async function recordingByIsrc(isrc: string): Promise<string | null> {
  const url = `${MB_BASE}/isrc/${encodeURIComponent(isrc)}?inc=recordings&fmt=json`;
  const res = await fetchJson<MbIsrcResponse>({
    provider: "MUSICBRAINZ",
    url,
    cacheKey: `isrc:${isrc}`,
  });
  if (!res.ok) return null;
  return res.data.recordings?.[0]?.id ?? null;
}

// ---- search tier -----------------------------------------------------------

type MbSearchResponse = { recordings?: MbRecording[] };

async function recordingBySearch(
  title: string,
  artist: string,
  durationSec: number | null,
): Promise<string | null> {
  let query = `recording:"${luceneEscape(title)}" AND artist:"${luceneEscape(artist)}"`;
  if (durationSec != null) {
    const ms = durationSec * 1000;
    query += ` AND dur:[${ms - 3000} TO ${ms + 3000}]`;
  }
  const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&limit=5&fmt=json`;
  const res = await fetchJson<MbSearchResponse>({
    provider: "MUSICBRAINZ",
    url,
    cacheKey: `recording:${normalizeForMatch(`${title} ${artist}`)}:${durationSec ?? ""}`,
  });
  if (!res.ok) return null;

  for (const rec of res.data.recordings ?? []) {
    if ((rec.score ?? 0) < MIN_SCORE) continue;
    if (durationSec != null && typeof rec.length === "number") {
      const recSec = Math.round(rec.length / 1000);
      if (Math.abs(recSec - durationSec) > DURATION_TOLERANCE_S) continue;
    }
    return rec.id;
  }
  return null;
}

// ---- detail lookups --------------------------------------------------------

async function recordingDetail(
  recordingId: string,
): Promise<{ workId: string | null; isrc: string | null }> {
  const url = `${MB_BASE}/recording/${encodeURIComponent(recordingId)}?inc=work-rels+isrcs&fmt=json`;
  const res = await fetchJson<MbRecording>({
    provider: "MUSICBRAINZ",
    url,
    cacheKey: url,
  });
  if (!res.ok) return { workId: null, isrc: null };
  const workId =
    res.data.relations?.find((r) => r.work?.id)?.work?.id ?? null;
  const isrc = res.data.isrcs?.[0] ?? null;
  return { workId, isrc };
}

async function workWriters(workId: string): Promise<string[]> {
  const url = `${MB_BASE}/work/${encodeURIComponent(workId)}?inc=artist-rels&fmt=json`;
  const res = await fetchJson<{ relations?: MbRelation[] }>({
    provider: "MUSICBRAINZ",
    url,
    cacheKey: url,
  });
  if (!res.ok) return [];
  const names = new Set<string>();
  for (const rel of res.data.relations ?? []) {
    if (rel.type && WRITER_TYPES.has(rel.type) && rel.artist?.name) {
      names.add(rel.artist.name);
    }
  }
  return [...names];
}

// ---- public API ------------------------------------------------------------

/**
 * Enrich a song with MusicBrainz recording/work data. Returns `data: null` when
 * no confident match is found (the caller should treat this as a completed job).
 */
export async function enrichRecording(input: {
  title: string;
  artist: string;
  durationSec: number | null;
  isrc: string | null;
}): Promise<ExternalResult<MbEnrichment | null>> {
  if (!env.musicResolutionEnabled) {
    return { ok: false, error: "Music resolution is disabled." };
  }

  let recordingId: string | null = null;
  if (input.isrc) recordingId = await recordingByIsrc(input.isrc);
  if (!recordingId) {
    recordingId = await recordingBySearch(
      input.title,
      input.artist,
      input.durationSec,
    );
  }
  if (!recordingId) return { ok: true, data: null, cached: false };

  const { workId, isrc } = await recordingDetail(recordingId);
  const writers = workId ? await workWriters(workId) : [];

  return {
    ok: true,
    data: {
      mbRecordingId: recordingId,
      mbWorkId: workId,
      isrc: input.isrc ?? isrc,
      writers,
    },
    cached: false,
  };
}
