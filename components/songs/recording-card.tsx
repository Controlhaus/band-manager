"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, Unlink } from "lucide-react";
import {
  resolveSingleSong,
  unlinkSongRecording,
  requeueEnrichmentJob,
} from "@/app/actions/song-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type {
  EnrichmentKind,
  EnrichmentState,
  SongResolutionStatus,
} from "@prisma/client";
import type { TrackCandidate } from "@/lib/external/types";

export type RecordingData = {
  appleTrackId: string | null;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  trackViewUrl: string | null;
  releaseDate: string | null;
  writers: string[];
  resolutionStatus: SongResolutionStatus;
};

export type EnrichmentJobView = {
  kind: EnrichmentKind;
  state: EnrichmentState;
  lastError: string | null;
};

const STATUS_LABEL: Record<SongResolutionStatus, string> = {
  UNRESOLVED: "Not linked",
  RESOLVED: "Linked",
  MANUAL: "Manual",
  FAILED: "Match failed",
};

const KIND_LABEL: Record<EnrichmentKind, string> = {
  ODESLI: "Streaming links",
  MUSICBRAINZ: "Credits & IDs",
};

export function RecordingCard({
  songId,
  canWrite,
  title,
  artist,
  recording,
  enrichmentJobs,
  resolutionEnabled,
}: {
  songId: string;
  canWrite: boolean;
  title: string;
  artist: string | null;
  recording: RecordingData;
  enrichmentJobs: EnrichmentJobView[];
  resolutionEnabled: boolean;
}) {
  const router = useRouter();
  const linked = recording.appleTrackId != null;

  // Nothing to show and can't do anything about it → render nothing.
  if (!resolutionEnabled && !linked) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Recording</CardTitle>
        <Badge variant={linked ? "outline" : "secondary"}>
          {STATUS_LABEL[recording.resolutionStatus]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {linked ? (
          <div className="flex gap-3">
            {recording.artworkUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recording.artworkUrl}
                alt=""
                width={96}
                height={96}
                className="h-24 w-24 shrink-0 rounded object-cover"
              />
            )}
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              {recording.album && (
                <p className="text-muted-foreground">{recording.album}</p>
              )}
              {recording.writers.length > 0 && (
                <p className="text-muted-foreground">
                  Writers: {recording.writers.join(", ")}
                </p>
              )}
              {recording.previewUrl && (
                <div className="space-y-0.5">
                  <audio
                    src={recording.previewUrl}
                    controls
                    preload="none"
                    className="h-8 w-full max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Preview provided courtesy of iTunes
                  </p>
                </div>
              )}
              {recording.trackViewUrl && (
                <a
                  href={recording.trackViewUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Listen on Apple Music
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This song isn&apos;t linked to a recording yet.
          </p>
        )}

        {linked && enrichmentJobs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {enrichmentJobs.map((job) => (
              <EnrichmentChip
                key={job.kind}
                job={job}
                songId={songId}
                canWrite={canWrite && resolutionEnabled}
                onDone={() => router.refresh()}
              />
            ))}
          </div>
        )}

        {canWrite && resolutionEnabled && (
          <div className="flex flex-wrap gap-2 pt-1">
            <ResolveDialog
              songId={songId}
              title={title}
              artist={artist}
              linked={linked}
              onDone={() => router.refresh()}
            />
            {linked && (
              <UnlinkButton songId={songId} onDone={() => router.refresh()} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnrichmentChip({
  job,
  songId,
  canWrite,
  onDone,
}: {
  job: EnrichmentJobView;
  songId: string;
  canWrite: boolean;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const variant =
    job.state === "FAILED"
      ? "destructive"
      : job.state === "DONE"
        ? "outline"
        : "secondary";
  const stateText =
    job.state === "QUEUED"
      ? "queued"
      : job.state === "RUNNING"
        ? "running…"
        : job.state === "DONE"
          ? "done"
          : "failed";

  async function retry() {
    setPending(true);
    const res = await requeueEnrichmentJob({ songId, kind: job.kind });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not retry", description: res.error });
      return;
    }
    onDone();
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={variant} title={job.lastError ?? undefined}>
        {KIND_LABEL[job.kind]}: {stateText}
      </Badge>
      {canWrite && job.state === "FAILED" && (
        <Button size="sm" variant="ghost" className="h-6 px-1" onClick={retry} disabled={pending}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </span>
  );
}

function UnlinkButton({
  songId,
  onDone,
}: {
  songId: string;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);

  async function onUnlink() {
    if (!confirm("Unlink this recording? Auto-added streaming links will be removed."))
      return;
    setPending(true);
    const res = await unlinkSongRecording({ songId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not unlink", description: res.error });
      return;
    }
    toast({ title: "Recording unlinked" });
    onDone();
  }

  return (
    <Button variant="outline" size="sm" onClick={onUnlink} disabled={pending}>
      <Unlink className="h-4 w-4" /> Unlink
    </Button>
  );
}

function ResolveDialog({
  songId,
  title,
  artist,
  linked,
  onDone,
}: {
  songId: string;
  title: string;
  artist: string | null;
  linked: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [t, setT] = React.useState(title);
  const [a, setA] = React.useState(artist ?? "");
  const [candidates, setCandidates] = React.useState<TrackCandidate[]>([]);

  async function search() {
    setPending(true);
    const res = await resolveSingleSong({ songId, title: t, artist: a });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Search failed", description: res.error });
      return;
    }
    setCandidates(res.data?.candidates ?? []);
  }

  async function apply(candidate: TrackCandidate) {
    setPending(true);
    const res = await resolveSingleSong({ songId, candidate });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not link", description: res.error });
      return;
    }
    toast({ title: "Recording linked" });
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Search className="h-4 w-4" /> {linked ? "Re-resolve" : "Find recording"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Find a recording</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Title" aria-label="Title" />
          <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Artist" aria-label="Artist" />
        </div>
        <Button onClick={search} disabled={pending || !t.trim()} size="sm">
          {pending ? "Searching…" : "Search"}
        </Button>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {candidates.map((cand, idx) => (
            <div
              key={cand.appleTrackId ?? idx}
              className="flex items-center gap-2 rounded border p-2 text-sm"
            >
              {cand.artworkUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cand.artworkUrl} alt="" width={36} height={36} className="h-9 w-9 rounded" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{cand.title}</span>
                <span className="block truncate text-muted-foreground">
                  {cand.artist}
                  {cand.album ? ` · ${cand.album}` : ""}
                </span>
              </span>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => apply(cand)}>
                Link
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
