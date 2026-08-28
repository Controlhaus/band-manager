/**
 * Shared helpers for turning a resolved `TrackCandidate` into persisted song
 * data, streaming links and enrichment jobs. Used by both the import commit and
 * the single-song resolve/re-resolve action. Not a server-action module.
 */

import type { Prisma } from "@prisma/client";
import type { TrackCandidate } from "../external/types";

type Db = Prisma.TransactionClient;

/** Deterministic song.link universal URL from an Apple track id (§18.6). */
export function songLinkUrl(appleTrackId: string): string {
  return `https://song.link/i/${appleTrackId}`;
}

/** Apple-sourced fields to backfill onto an existing song (no title/artist). */
export function candidateAppleFields(c: TrackCandidate) {
  return {
    appleTrackId: c.appleTrackId,
    appleCollectionId: c.appleCollectionId,
    releaseDate: c.releaseDate ? new Date(c.releaseDate) : null,
    artworkUrl: c.artworkUrl,
    previewUrl: c.previewUrl,
    resolutionStatus: "RESOLVED" as const,
    resolvedAt: new Date(),
  };
}

/** Full scalar fields for creating a new song from a candidate. */
export function candidateCreateData(
  c: TrackCandidate,
  actId: string,
): Prisma.SongUncheckedCreateInput {
  return {
    actId,
    title: c.title,
    artist: c.artist || null,
    album: c.album || null,
    durationSec: c.durationSec ?? null,
    // iTunes primaryGenreName is a prefill hint for the otherwise-empty style.
    style: c.genre || null,
    status: "IDEA",
    ...candidateAppleFields(c),
  };
}

/**
 * Write the Apple Music (source ITUNES) and deterministic song.link
 * (source ODESLI) rows for a song. Idempotent via the source-scoped unique key.
 * Pass `versionId` to attach the links to a specific version instead of the song.
 */
export async function writeCandidateLinks(
  db: Db,
  songId: string,
  c: TrackCandidate,
  versionId: string | null = null,
): Promise<void> {
  const rows: Prisma.SongLinkCreateManyInput[] = [];
  if (c.trackViewUrl) {
    rows.push({
      songId,
      versionId,
      platform: "APPLE_MUSIC",
      source: "ITUNES",
      url: c.trackViewUrl,
    });
  }
  if (c.appleTrackId) {
    rows.push({
      songId,
      versionId,
      platform: "SONGLINK",
      source: "ODESLI",
      url: songLinkUrl(c.appleTrackId),
    });
  }
  if (rows.length > 0) {
    await db.songLink.createMany({ data: rows, skipDuplicates: true });
  }
}

/**
 * Create a new SongVersion on an existing song from a resolved candidate and
 * attach the candidate's Apple Music + song.link URLs at version level (§19).
 * Returns the new version id. Async platform enrichment (Spotify/YouTube) is
 * song-keyed and not run for versions.
 */
export async function createVersionFromCandidate(
  db: Db,
  songId: string,
  c: TrackCandidate,
): Promise<string> {
  const name = c.album?.trim() || "Imported version";
  const version = await db.songVersion.create({
    data: { songId, name },
    select: { id: true },
  });
  await writeCandidateLinks(db, songId, c, version.id);
  return version.id;
}

/** Queue (or reset) the ODESLI + MUSICBRAINZ + LYRICS enrichment jobs for a song. */
export async function enqueueEnrichment(db: Db, songId: string): Promise<void> {
  const kinds = ["ODESLI", "MUSICBRAINZ", "LYRICS"] as const;
  for (const kind of kinds) {
    await db.enrichmentJob.upsert({
      where: { songId_kind: { songId, kind } },
      create: { songId, kind, state: "QUEUED", attempts: 0, runAfter: new Date() },
      update: {
        state: "QUEUED",
        attempts: 0,
        runAfter: new Date(),
        lastError: null,
        completedAt: null,
      },
    });
  }
}
