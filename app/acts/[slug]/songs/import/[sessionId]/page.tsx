import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { can } from "@/lib/roles";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { ImportReview } from "@/components/songs/import-review";
import type { ImportLineView } from "@/components/songs/import-review";
import type { TrackCandidate } from "@/lib/external/types";

export const dynamic = "force-dynamic";

export default async function SongImportReviewPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();
  if (!can(act.role, "song:write")) redirect(`/acts/${slug}/songs`);
  if (!env.musicResolutionEnabled) redirect(`/acts/${slug}/songs`);

  const session = await prisma.songImportSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      actId: true,
      status: true,
      targetSet: { select: { setListId: true } },
      lines: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          rawLine: true,
          parsedTitle: true,
          parsedArtist: true,
          parsedAlbumHint: true,
          candidates: true,
          selectedCandidateIdx: true,
          existingSongId: true,
          action: true,
          state: true,
          errorMessage: true,
        },
      },
    },
  });
  if (!session || session.actId !== act.id) notFound();
  const targetSetListId = session.targetSet?.setListId ?? null;
  const backHref = targetSetListId
    ? `/acts/${slug}/setlists/${targetSetListId}`
    : `/acts/${slug}/songs`;
  if (session.status === "COMMITTED" || session.status === "ABANDONED") {
    redirect(backHref);
  }

  const existingSongs = await prisma.song.findMany({
    where: { actId: act.id },
    select: { id: true, title: true, artist: true },
    orderBy: { title: "asc" },
  });

  const lines: ImportLineView[] = session.lines.map((line) => ({
    id: line.id,
    position: line.position,
    rawLine: line.rawLine,
    parsedTitle: line.parsedTitle,
    parsedArtist: line.parsedArtist,
    parsedAlbumHint: line.parsedAlbumHint,
    candidates: Array.isArray(line.candidates)
      ? (line.candidates as unknown as TrackCandidate[])
      : [],
    selectedCandidateIdx: line.selectedCandidateIdx,
    existingSongId: line.existingSongId,
    action: line.action,
    state: line.state,
    errorMessage: line.errorMessage,
  }));

  return (
    <ImportReview
      sessionId={session.id}
      slug={slug}
      status={session.status}
      lines={lines}
      existingSongs={existingSongs}
      targetSetListId={targetSetListId}
    />
  );
}
