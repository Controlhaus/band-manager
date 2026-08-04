"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  AuthorizationError,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";
import { env } from "@/lib/env";
import { parseImportText, type ParsedLine } from "@/lib/import/parse";
import { findDuplicate, resolveParsedLine } from "@/lib/import/resolve";
import { searchTracks } from "@/lib/external/itunes";
import type { TrackCandidate } from "@/lib/external/types";
import {
  candidateAppleFields,
  candidateCreateData,
  createVersionFromCandidate,
  enqueueEnrichment,
  writeCandidateLinks,
} from "@/lib/import/apply";

const MAX_LINES = 200;

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

function requireResolutionEnabled(): void {
  if (!env.musicResolutionEnabled) {
    throw new AuthorizationError("Song resolution is disabled.");
  }
}

/** Re-derive the act (id + slug) for an import session — never trust the client. */
async function sessionAct(
  sessionId: string,
): Promise<{ actId: string; slug: string } | null> {
  const session = await prisma.songImportSession.findUnique({
    where: { id: sessionId },
    select: { act: { select: { id: true, slug: true } } },
  });
  return session ? { actId: session.act.id, slug: session.act.slug } : null;
}

/** Reconstruct a ParsedLine from a stored import line row. */
function toParsedLine(line: {
  rawLine: string;
  parsedTitle: string | null;
  parsedArtist: string | null;
  parsedAlbumHint: string | null;
}): ParsedLine {
  return {
    rawLine: line.rawLine,
    parsedTitle: line.parsedTitle ?? line.rawLine,
    parsedArtist: line.parsedArtist,
    parsedAlbumHint: line.parsedAlbumHint,
    hadSeparator: line.parsedArtist != null,
  };
}

function readCandidates(value: Prisma.JsonValue): TrackCandidate[] {
  return Array.isArray(value) ? (value as unknown as TrackCandidate[]) : [];
}

// ---- create ----------------------------------------------------------------

const createSchema = z.object({
  actId: z.string().min(1),
  rawInput: z.string().min(1, "Paste at least one line."),
  // When set, the import also appends its songs to this set (§19).
  targetSetId: z.string().min(1).optional(),
});

export async function createSongImportSession(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const data = createSchema.parse(input);
    await requireCapability(user, data.actId, "song:write");

    if (data.targetSetId) {
      const set = await prisma.setListSet.findUnique({
        where: { id: data.targetSetId },
        select: { setList: { select: { actId: true } } },
      });
      if (!set || set.setList.actId !== data.actId) {
        return { ok: false, error: "Target set not found in this act." };
      }
      await requireCapability(user, data.actId, "setlist:write");
    }

    const parsed = parseImportText(data.rawInput);
    if (parsed.length === 0) {
      return { ok: false, error: "No song lines found in the pasted text." };
    }
    if (parsed.length > MAX_LINES) {
      return {
        ok: false,
        error: `Too many lines (${parsed.length}). The limit is ${MAX_LINES}.`,
      };
    }

    const session = await prisma.songImportSession.create({
      data: {
        actId: data.actId,
        createdById: user.id,
        status: "DRAFT",
        rawInput: data.rawInput,
        targetSetId: data.targetSetId ?? null,
        lines: {
          create: parsed.map((line, index) => ({
            position: index,
            rawLine: line.rawLine,
            parsedTitle: line.parsedTitle,
            parsedArtist: line.parsedArtist,
            parsedAlbumHint: line.parsedAlbumHint,
            state: "PENDING",
            action: "CREATE",
          })),
        },
      },
      select: { id: true },
    });

    return { ok: true, data: { sessionId: session.id } };
  });
}

// ---- resolve (throttled, progressive) --------------------------------------

/** In-process guard so a reloaded review page can't double-run resolution. */
const resolving = new Set<string>();

async function processSession(sessionId: string): Promise<void> {
  if (resolving.has(sessionId)) return;
  resolving.add(sessionId);
  try {
    const session = await prisma.songImportSession.findUnique({
      where: { id: sessionId },
      select: { actId: true },
    });
    if (!session) return;

    const existing = await prisma.song.findMany({
      where: { actId: session.actId },
      select: { id: true, title: true, artist: true },
    });

    const lines = await prisma.songImportLine.findMany({
      where: { sessionId, state: "PENDING" },
      orderBy: { position: "asc" },
    });

    for (const line of lines) {
      const parsed = toParsedLine(line);

      const duplicateId = findDuplicate(parsed, existing);
      if (duplicateId) {
        await prisma.songImportLine.update({
          where: { id: line.id },
          data: {
            existingSongId: duplicateId,
            action: "LINK_EXISTING",
            state: "RESOLVED",
            candidates: [],
          },
        });
        continue;
      }

      const outcome = await resolveParsedLine(parsed);
      await prisma.songImportLine.update({
        where: { id: line.id },
        data: {
          candidates: outcome.candidates as unknown as Prisma.InputJsonValue,
          selectedCandidateIdx: outcome.selectedCandidateIdx,
          state: outcome.state,
          errorMessage: outcome.errorMessage,
          // A no-match line defaults to manual entry in review.
          action: outcome.state === "NO_MATCH" ? "MANUAL" : "CREATE",
        },
      });
    }

    await prisma.songImportSession.update({
      where: { id: sessionId },
      data: { status: "REVIEW" },
    });
  } catch (err) {
    console.error("[song-import] resolution failed:", err);
  } finally {
    resolving.delete(sessionId);
  }
}

export async function resolveSongImportSession(input: {
  sessionId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(input);
    const act = await sessionAct(sessionId);
    if (!act) return { ok: false, error: "Import session not found." };
    await requireCapability(user, act.actId, "song:write");

    await prisma.songImportSession.update({
      where: { id: sessionId },
      data: { status: "RESOLVING" },
    });
    // Fire-and-forget: the review page polls progress. The single-node Node
    // process keeps this promise alive; all work is DB-persisted.
    void processSession(sessionId);
    return { ok: true };
  });
}

// ---- per-line edits ---------------------------------------------------------

const updateLineSchema = z.object({
  lineId: z.string().min(1),
  action: z.enum(["CREATE", "LINK_EXISTING", "SKIP", "MANUAL", "NEW_VERSION"]),
  selectedCandidateIdx: z.number().int().min(0).nullable().optional(),
  existingSongId: z.string().nullable().optional(),
  title: z.string().trim().max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  album: z.string().trim().max(200).optional(),
});

export async function updateSongImportLine(
  input: z.infer<typeof updateLineSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = updateLineSchema.parse(input);

    const line = await prisma.songImportLine.findUnique({
      where: { id: data.lineId },
      select: { session: { select: { actId: true } } },
    });
    if (!line) return { ok: false, error: "Import line not found." };
    await requireCapability(user, line.session.actId, "song:write");

    const patch: Prisma.SongImportLineUpdateInput = { action: data.action };
    if (data.action === "CREATE") {
      patch.selectedCandidateIdx = data.selectedCandidateIdx ?? null;
    } else if (data.action === "LINK_EXISTING") {
      if (!data.existingSongId) {
        return { ok: false, error: "Choose an existing song to link." };
      }
      patch.existingSong = { connect: { id: data.existingSongId } };
      patch.selectedCandidateIdx = data.selectedCandidateIdx ?? null;
    } else if (data.action === "NEW_VERSION") {
      if (!data.existingSongId) {
        return { ok: false, error: "Choose the song to add a version to." };
      }
      if (data.selectedCandidateIdx == null) {
        return { ok: false, error: "Choose a recording for the new version." };
      }
      patch.existingSong = { connect: { id: data.existingSongId } };
      patch.selectedCandidateIdx = data.selectedCandidateIdx;
    } else if (data.action === "MANUAL") {
      if (!data.title) {
        return { ok: false, error: "A title is required for manual entry." };
      }
      // Manual values are stored on the parsed columns and read at commit.
      patch.parsedTitle = data.title;
      patch.parsedArtist = data.artist || null;
      patch.parsedAlbumHint = data.album || null;
    }

    await prisma.songImportLine.update({ where: { id: data.lineId }, data: patch });
    return { ok: true };
  });
}

export async function retrySongImportLine(input: {
  lineId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const { lineId } = z.object({ lineId: z.string().min(1) }).parse(input);

    const line = await prisma.songImportLine.findUnique({
      where: { id: lineId },
      select: {
        rawLine: true,
        parsedTitle: true,
        parsedArtist: true,
        parsedAlbumHint: true,
        session: { select: { actId: true } },
      },
    });
    if (!line) return { ok: false, error: "Import line not found." };
    await requireCapability(user, line.session.actId, "song:write");

    const outcome = await resolveParsedLine(toParsedLine(line));
    await prisma.songImportLine.update({
      where: { id: lineId },
      data: {
        candidates: outcome.candidates as unknown as Prisma.InputJsonValue,
        selectedCandidateIdx: outcome.selectedCandidateIdx,
        state: outcome.state,
        errorMessage: outcome.errorMessage,
        action: outcome.state === "NO_MATCH" ? "MANUAL" : "CREATE",
      },
    });
    return { ok: true };
  });
}

/**
 * Lazily resolve iTunes candidates for a line WITHOUT changing its action or
 * existing-song link. Used when a duplicate row switches to "New version" and
 * needs recordings to pick from (§19).
 */
export async function resolveImportLineCandidates(input: {
  lineId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const { lineId } = z.object({ lineId: z.string().min(1) }).parse(input);

    const line = await prisma.songImportLine.findUnique({
      where: { id: lineId },
      select: {
        rawLine: true,
        parsedTitle: true,
        parsedArtist: true,
        parsedAlbumHint: true,
        session: { select: { actId: true } },
      },
    });
    if (!line) return { ok: false, error: "Import line not found." };
    await requireCapability(user, line.session.actId, "song:write");

    const outcome = await resolveParsedLine(toParsedLine(line));
    await prisma.songImportLine.update({
      where: { id: lineId },
      data: {
        candidates: outcome.candidates as unknown as Prisma.InputJsonValue,
        selectedCandidateIdx: outcome.selectedCandidateIdx ?? 0,
      },
    });
    return { ok: true };
  });
}

// ---- commit -----------------------------------------------------------------

export async function commitSongImportSession(input: {
  sessionId: string;
}): Promise<ActionResult<{ slug: string; songIds: string[]; targetSetListId: string | null }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(input);

    const session = await prisma.songImportSession.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        targetSetId: true,
        targetSet: { select: { setListId: true } },
        act: { select: { id: true, slug: true } },
        lines: { orderBy: { position: "asc" } },
      },
    });
    if (!session) return { ok: false, error: "Import session not found." };
    await requireCapability(user, session.act.id, "song:write");
    if (session.targetSetId) {
      await requireCapability(user, session.act.id, "setlist:write");
    }

    if (session.status === "COMMITTED") {
      return { ok: false, error: "This import has already been committed." };
    }

    const actId = session.act.id;
    const songIds = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      // Songs to append to the target set, in line order (§19).
      const entries: { songId: string; songVersionId: string | null }[] = [];

      for (const line of session.lines) {
        const candidates = readCandidates(line.candidates);
        const selected =
          line.selectedCandidateIdx != null
            ? candidates[line.selectedCandidateIdx]
            : undefined;

        if (line.action === "SKIP") continue;

        if (line.action === "MANUAL") {
          if (!line.parsedTitle) continue;
          const song = await tx.song.create({
            data: {
              actId,
              title: line.parsedTitle,
              artist: line.parsedArtist || null,
              album: line.parsedAlbumHint || null,
              status: "IDEA",
              resolutionStatus: "MANUAL",
            },
            select: { id: true },
          });
          created.push(song.id);
          entries.push({ songId: song.id, songVersionId: null });
          continue;
        }

        if (line.action === "CREATE") {
          if (!selected) continue;
          const song = await tx.song.create({
            data: candidateCreateData(selected, actId),
            select: { id: true },
          });
          await writeCandidateLinks(tx, song.id, selected);
          await enqueueEnrichment(tx, song.id);
          created.push(song.id);
          entries.push({ songId: song.id, songVersionId: null });
          continue;
        }

        if (line.action === "NEW_VERSION") {
          if (!line.existingSongId || !selected) continue;
          const existing = await tx.song.findUnique({
            where: { id: line.existingSongId },
            select: { id: true, actId: true },
          });
          // Guard against cross-act linking.
          if (!existing || existing.actId !== actId) continue;
          const versionId = await createVersionFromCandidate(tx, existing.id, selected);
          created.push(existing.id);
          entries.push({ songId: existing.id, songVersionId: versionId });
          continue;
        }

        if (line.action === "LINK_EXISTING") {
          if (!line.existingSongId) continue;
          const existing = await tx.song.findUnique({
            where: { id: line.existingSongId },
            select: { id: true, actId: true, appleTrackId: true },
          });
          // Guard against cross-act linking.
          if (!existing || existing.actId !== actId) continue;
          if (!existing.appleTrackId && selected) {
            await tx.song.update({
              where: { id: existing.id },
              data: candidateAppleFields(selected),
            });
            await writeCandidateLinks(tx, existing.id, selected);
            await enqueueEnrichment(tx, existing.id);
          }
          created.push(existing.id);
          entries.push({ songId: existing.id, songVersionId: null });
        }
      }

      if (session.targetSetId && entries.length > 0) {
        const agg = await tx.setEntry.aggregate({
          where: { setId: session.targetSetId },
          _max: { position: true },
        });
        let position = (agg._max.position ?? 0) + 1;
        for (const e of entries) {
          await tx.setEntry.create({
            data: {
              setId: session.targetSetId,
              kind: "SONG",
              songId: e.songId,
              songVersionId: e.songVersionId,
              position: position++,
            },
          });
        }
      }

      await tx.songImportSession.update({
        where: { id: sessionId },
        data: { status: "COMMITTED", committedAt: new Date() },
      });

      return created;
    });

    const targetSetListId = session.targetSet?.setListId ?? null;
    revalidatePath(`/acts/${session.act.slug}/songs`);
    if (targetSetListId) {
      revalidatePath(`/acts/${session.act.slug}/setlists`);
      revalidatePath(`/acts/${session.act.slug}/setlists/${targetSetListId}`);
    }
    return { ok: true, data: { slug: session.act.slug, songIds, targetSetListId } };
  });
}

export async function abandonSongImportSession(input: {
  sessionId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(input);
    const act = await sessionAct(sessionId);
    if (!act) return { ok: false, error: "Import session not found." };
    await requireCapability(user, act.actId, "song:write");

    await prisma.songImportSession.update({
      where: { id: sessionId },
      data: { status: "ABANDONED" },
    });
    return { ok: true, data: undefined };
  });
}

// ---- single-song resolve / re-resolve / unlink ------------------------------

const resolveSingleSchema = z.object({
  songId: z.string().min(1),
  // Search mode: provide a query. Apply mode: provide a candidate.
  title: z.string().trim().max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  candidate: z.custom<TrackCandidate>().optional(),
});

async function actIdForSong(songId: string): Promise<{
  actId: string;
  slug: string;
} | null> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { act: { select: { id: true, slug: true } } },
  });
  return song ? { actId: song.act.id, slug: song.act.slug } : null;
}

/**
 * Search for candidates (no mutation) or, when a `candidate` is supplied, apply
 * it to the song — writing Apple fields + links and queuing enrichment.
 */
export async function resolveSingleSong(
  input: z.infer<typeof resolveSingleSchema>,
): Promise<ActionResult<{ candidates?: TrackCandidate[] }>> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const data = resolveSingleSchema.parse(input);
    const act = await actIdForSong(data.songId);
    if (!act) return { ok: false, error: "Song not found." };
    await requireCapability(user, act.actId, "song:write");

    if (data.candidate) {
      const candidate = data.candidate;
      await prisma.$transaction(async (tx) => {
        await tx.song.update({
          where: { id: data.songId },
          data: candidateAppleFields(candidate),
        });
        await writeCandidateLinks(tx, data.songId, candidate);
        await enqueueEnrichment(tx, data.songId);
      });
      revalidatePath(`/acts/${act.slug}/songs/${data.songId}`);
      return { ok: true, data: {} as { candidates?: TrackCandidate[] } };
    }

    const term = `${data.artist ?? ""} ${data.title ?? ""}`.trim();
    if (!term) return { ok: false, error: "Enter a title or artist to search." };
    const res = await searchTracks(term);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, data: { candidates: res.data.slice(0, 8) } };
  });
}

export async function unlinkSongRecording(input: {
  songId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { songId } = z.object({ songId: z.string().min(1) }).parse(input);
    const act = await actIdForSong(songId);
    if (!act) return { ok: false, error: "Song not found." };
    await requireCapability(user, act.actId, "song:write");

    await prisma.$transaction(async (tx) => {
      await tx.songLink.deleteMany({
        where: { songId, source: { not: "MANUAL" } },
      });
      await tx.enrichmentJob.deleteMany({ where: { songId } });
      await tx.song.update({
        where: { id: songId },
        data: {
          appleTrackId: null,
          appleCollectionId: null,
          isrc: null,
          releaseDate: null,
          artworkUrl: null,
          previewUrl: null,
          mbRecordingId: null,
          mbWorkId: null,
          writers: [],
          resolutionStatus: "MANUAL",
          resolvedAt: null,
        },
      });
    });

    revalidatePath(`/acts/${act.slug}/songs/${songId}`);
    return { ok: true };
  });
}

export async function requeueEnrichmentJob(input: {
  songId: string;
  kind: "ODESLI" | "MUSICBRAINZ";
}): Promise<ActionResult> {
  return runAction(async () => {
    requireResolutionEnabled();
    const user = await requireUser();
    const { songId, kind } = z
      .object({
        songId: z.string().min(1),
        kind: z.enum(["ODESLI", "MUSICBRAINZ"]),
      })
      .parse(input);
    const act = await actIdForSong(songId);
    if (!act) return { ok: false, error: "Song not found." };
    await requireCapability(user, act.actId, "song:write");

    await prisma.enrichmentJob.upsert({
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
    revalidatePath(`/acts/${act.slug}/songs/${songId}`);
    return { ok: true };
  });
}
