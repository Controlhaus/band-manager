/**
 * Async enrichment runner (§18.4). Processes queued `EnrichmentJob` rows:
 *  - ODESLI: resolves cross-platform streaming links from the song's Apple URL.
 *  - MUSICBRAINZ: backfills recording/work ids, ISRC and writer credits.
 *
 * Runs from the node-cron scheduler (gated by ENABLE_SCHEDULER) every 30s. Jobs
 * are claimed atomically with `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING` so a
 * future second instance can't double-claim. External misses/failures never
 * corrupt a song — they back off and retry, then FAIL after five attempts.
 */

import { Prisma, type EnrichmentKind } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { resolveLinks } from "./external/odesli";
import { enrichRecording } from "./external/musicbrainz";

const CLAIM_LIMIT = 20;
const MAX_ATTEMPTS = 5;
const STUCK_RUNNING_MS = 10 * 60 * 1000;

type ClaimedJob = { id: string; songId: string; kind: EnrichmentKind };

async function markDone(jobId: string): Promise<void> {
  await prisma.enrichmentJob.update({
    where: { id: jobId },
    data: { state: "DONE", completedAt: new Date(), lastError: null },
  });
}

async function failOrRetry(jobId: string, err: unknown): Promise<void> {
  const job = await prisma.enrichmentJob.findUnique({
    where: { id: jobId },
    select: { attempts: true },
  });
  const attempts = (job?.attempts ?? 0) + 1;
  const message = err instanceof Error ? err.message : String(err);
  if (attempts >= MAX_ATTEMPTS) {
    await prisma.enrichmentJob.update({
      where: { id: jobId },
      data: { state: "FAILED", attempts, lastError: message },
    });
    return;
  }
  const runAfter = new Date(Date.now() + 2 ** attempts * 60 * 1000);
  await prisma.enrichmentJob.update({
    where: { id: jobId },
    data: { state: "QUEUED", attempts, lastError: message, runAfter },
  });
}

async function runOdesli(jobId: string, songId: string): Promise<void> {
  const appleLink = await prisma.songLink.findFirst({
    where: { songId, platform: "APPLE_MUSIC", source: "ITUNES" },
    select: { url: true },
  });
  // No Apple URL ⇒ nothing to resolve (e.g. a manual song). Complete cleanly.
  if (!appleLink) {
    await markDone(jobId);
    return;
  }

  const res = await resolveLinks(appleLink.url);
  if (!res.ok) throw new Error(res.error);

  // Empty result: keep the deterministic song.link row already present.
  if (res.data.length === 0) {
    await markDone(jobId);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Replace ODESLI-sourced song-level rows only; never touch MANUAL links.
    await tx.songLink.deleteMany({
      where: { songId, source: "ODESLI", versionId: null },
    });
    await tx.songLink.createMany({
      data: res.data.map((link) => ({
        songId,
        platform: link.platform,
        source: "ODESLI" as const,
        url: link.url,
      })),
      skipDuplicates: true,
    });
    await tx.enrichmentJob.update({
      where: { id: jobId },
      data: { state: "DONE", completedAt: new Date(), lastError: null },
    });
  });
}

async function runMusicbrainz(jobId: string, songId: string): Promise<void> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { title: true, artist: true, durationSec: true, isrc: true },
  });
  if (!song) {
    await markDone(jobId);
    return;
  }

  const res = await enrichRecording({
    title: song.title,
    artist: song.artist ?? "",
    durationSec: song.durationSec,
    isrc: song.isrc,
  });
  if (!res.ok) throw new Error(res.error);

  if (res.data) {
    await prisma.song.update({
      where: { id: songId },
      data: {
        mbRecordingId: res.data.mbRecordingId,
        mbWorkId: res.data.mbWorkId,
        isrc: song.isrc ?? res.data.isrc,
        writers: res.data.writers,
      },
    });
  }
  await markDone(jobId);
}

async function processJob(job: ClaimedJob): Promise<void> {
  if (job.kind === "ODESLI") await runOdesli(job.id, job.songId);
  else await runMusicbrainz(job.id, job.songId);
}

/** One scheduler tick: reset stuck jobs, claim a batch, process each. */
export async function runEnrichmentTick(): Promise<void> {
  if (!env.musicResolutionEnabled) return;

  // Reclaim jobs stuck in RUNNING (e.g. a crash mid-process).
  await prisma.enrichmentJob.updateMany({
    where: {
      state: "RUNNING",
      updatedAt: { lt: new Date(Date.now() - STUCK_RUNNING_MS) },
    },
    data: { state: "QUEUED" },
  });

  const claimed = await prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "enrichment_job" AS j
    SET state = 'RUNNING'::"EnrichmentState", "updatedAt" = now()
    FROM (
      SELECT id FROM "enrichment_job"
      WHERE state = 'QUEUED'::"EnrichmentState" AND "runAfter" <= now()
      ORDER BY "createdAt" ASC
      LIMIT ${CLAIM_LIMIT}
      FOR UPDATE SKIP LOCKED
    ) AS claimed
    WHERE j.id = claimed.id
    RETURNING j.id AS "id", j."songId" AS "songId", j.kind AS "kind";
  `);

  for (const job of claimed) {
    try {
      await processJob(job);
    } catch (err) {
      await failOrRetry(job.id, err);
    }
  }
}

/**
 * Daily maintenance (§18.4, §18.10): drop expired cache rows and abandoned
 * import sessions still in DRAFT/REVIEW after 7 days.
 */
export async function runEnrichmentMaintenance(): Promise<void> {
  const now = new Date();
  await prisma.externalLookupCache.deleteMany({
    where: { expiresAt: { not: null, lte: now } },
  });
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await prisma.songImportSession.deleteMany({
    where: { status: { in: ["DRAFT", "REVIEW"] }, createdAt: { lt: cutoff } },
  });
}
