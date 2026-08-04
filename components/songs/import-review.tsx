"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import type {
  ImportLineAction,
  ImportLineState,
  ImportSessionStatus,
} from "@prisma/client";
import type { TrackCandidate } from "@/lib/external/types";
import {
  abandonSongImportSession,
  commitSongImportSession,
  resolveImportLineCandidates,
  retrySongImportLine,
  updateSongImportLine,
} from "@/app/actions/song-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export interface ImportLineView {
  id: string;
  position: number;
  rawLine: string;
  parsedTitle: string | null;
  parsedArtist: string | null;
  parsedAlbumHint: string | null;
  candidates: TrackCandidate[];
  selectedCandidateIdx: number | null;
  existingSongId: string | null;
  action: ImportLineAction;
  state: ImportLineState;
  errorMessage: string | null;
}

type ExistingSong = { id: string; title: string; artist: string | null };

const ACTION_OPTIONS: { value: ImportLineAction; label: string }[] = [
  { value: "CREATE", label: "Add" },
  { value: "LINK_EXISTING", label: "Link existing" },
  { value: "MANUAL", label: "Manual" },
  { value: "SKIP", label: "Skip" },
];

// Only offered when a line already matches a library song.
const NEW_VERSION_OPTION: { value: ImportLineAction; label: string } = {
  value: "NEW_VERSION",
  label: "New version",
};

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// A single shared <audio> element controlled across all rows.
function usePreviewPlayer() {
  const ref = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const play = React.useCallback((key: string, url: string) => {
    const el = ref.current;
    if (!el) return;
    if (playing === key) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = url;
    void el.play();
    setPlaying(key);
  }, [playing]);
  return { ref, playing, play, stop: () => setPlaying(null) };
}

export function ImportReview({
  sessionId,
  slug,
  status,
  lines,
  existingSongs,
  targetSetListId,
}: {
  sessionId: string;
  slug: string;
  status: ImportSessionStatus;
  lines: ImportLineView[];
  existingSongs: ExistingSong[];
  targetSetListId: string | null;
}) {
  const router = useRouter();
  const player = usePreviewPlayer();
  const [committing, setCommitting] = React.useState(false);
  const resolving = status === "RESOLVING" || status === "DRAFT";

  const backHref = targetSetListId
    ? `/acts/${slug}/setlists/${targetSetListId}`
    : `/acts/${slug}/songs`;

  // Poll for progress while resolution runs on the server.
  React.useEffect(() => {
    if (!resolving) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [resolving, router]);

  const counts = React.useMemo(() => {
    let add = 0,
      link = 0,
      skip = 0,
      manual = 0,
      version = 0;
    for (const l of lines) {
      if (l.action === "CREATE") add += 1;
      else if (l.action === "LINK_EXISTING") link += 1;
      else if (l.action === "MANUAL") manual += 1;
      else if (l.action === "NEW_VERSION") version += 1;
      else if (l.action === "SKIP") skip += 1;
    }
    return { add, link, skip, manual, version };
  }, [lines]);

  async function onCommit() {
    setCommitting(true);
    const res = await commitSongImportSession({ sessionId });
    if (!res.ok) {
      setCommitting(false);
      toast({ variant: "destructive", title: "Import failed", description: res.error });
      return;
    }
    toast({
      title: "Songs imported",
      description: `${res.data?.songIds.length ?? 0} song(s) added to the catalog.`,
    });
    router.push(backHref);
  }

  async function onDiscard() {
    const res = await abandonSongImportSession({ sessionId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not discard", description: res.error });
      return;
    }
    router.push(backHref);
  }

  return (
    <div className="space-y-4">
      <audio ref={player.ref} onEnded={player.stop} className="hidden" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review import</h1>
          <p className="text-muted-foreground">
            {resolving
              ? "Looking up matches…"
              : "Choose what to do with each line, then confirm."}
          </p>
        </div>
        {resolving && <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-2">
        {lines.map((line) => (
          <ImportRow
            key={line.id}
            line={line}
            existingSongs={existingSongs}
            player={player}
            disabled={resolving || committing}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Add {counts.add + counts.manual}, link {counts.link}, skip {counts.skip}
          {counts.version > 0 ? `, +${counts.version} version(s)` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard} disabled={committing}>
            Discard
          </Button>
          <Button onClick={onCommit} disabled={resolving || committing}>
            {committing ? "Importing…" : "Confirm import"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function stateBadge(state: ImportLineState) {
  switch (state) {
    case "RESOLVED":
      return <Badge variant="outline">Matched</Badge>;
    case "NO_MATCH":
      return <Badge variant="secondary">No match</Badge>;
    case "ERROR":
      return <Badge variant="destructive">Error</Badge>;
    case "PENDING":
    default:
      return <Badge variant="secondary">Pending…</Badge>;
  }
}

function ImportRow({
  line,
  existingSongs,
  player,
  disabled,
  onChanged,
}: {
  line: ImportLineView;
  existingSongs: ExistingSong[];
  player: ReturnType<typeof usePreviewPlayer>;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [manualTitle, setManualTitle] = React.useState(line.parsedTitle ?? "");
  const [manualArtist, setManualArtist] = React.useState(line.parsedArtist ?? "");
  const [manualAlbum, setManualAlbum] = React.useState(line.parsedAlbumHint ?? "");

  const selectedIdx = line.selectedCandidateIdx ?? 0;

  const [uiAction, setUiAction] = React.useState<ImportLineAction>(line.action);
  const [fetching, setFetching] = React.useState(false);
  React.useEffect(() => setUiAction(line.action), [line.action]);

  const existingName = React.useMemo(() => {
    const s = existingSongs.find((x) => x.id === line.existingSongId);
    return s ? `${s.title}${s.artist ? ` — ${s.artist}` : ""}` : "the matched song";
  }, [existingSongs, line.existingSongId]);

  async function apply(patch: Parameters<typeof updateSongImportLine>[0]) {
    setPending(true);
    const res = await updateSongImportLine(patch);
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update", description: res.error });
      return;
    }
    onChanged();
  }

  async function onRetry() {
    setPending(true);
    const res = await retrySongImportLine({ lineId: line.id });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Retry failed", description: res.error });
      return;
    }
    onChanged();
  }

  const busy = disabled || pending;

  // NEW_VERSION is persisted only once a recording is chosen (it requires one),
  // so switching to it just fetches candidates and shows the picker.
  async function onFetchCandidates() {
    setFetching(true);
    const res = await resolveImportLineCandidates({ lineId: line.id });
    setFetching(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not find recordings", description: res.error });
      return;
    }
    onChanged();
  }

  async function onSelectAction(next: ImportLineAction) {
    setUiAction(next);
    if (next === "NEW_VERSION") {
      if (line.candidates.length === 0) await onFetchCandidates();
      return;
    }
    await apply({ lineId: line.id, action: next });
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={line.rawLine}>
          {line.rawLine}
        </span>
        {stateBadge(line.state)}
        {(line.state === "ERROR" || line.state === "NO_MATCH") && (
          <Button size="sm" variant="ghost" onClick={onRetry} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
        <select
          value={uiAction}
          disabled={busy}
          onChange={(e) => onSelectAction(e.target.value as ImportLineAction)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Action"
        >
          {(line.existingSongId
            ? [...ACTION_OPTIONS, NEW_VERSION_OPTION]
            : ACTION_OPTIONS
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {line.errorMessage && line.state === "ERROR" && (
        <p className="mt-1 text-xs text-destructive">{line.errorMessage}</p>
      )}

      {/* CREATE — candidate picker */}
      {uiAction === "CREATE" && line.candidates.length > 0 && (
        <div className="mt-2 space-y-1">
          {(expanded ? line.candidates : line.candidates.slice(0, 1)).map(
            (cand, idx) => (
              <CandidateItem
                key={cand.appleTrackId ?? idx}
                cand={cand}
                checked={selectedIdx === idx}
                previewKey={`${line.id}:${idx}`}
                player={player}
                disabled={busy}
                onSelect={() =>
                  apply({
                    lineId: line.id,
                    action: "CREATE",
                    selectedCandidateIdx: idx,
                  })
                }
              />
            ),
          )}
          {line.candidates.length > 1 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {expanded
                ? "Show fewer"
                : `Show ${line.candidates.length - 1} more match(es)`}
            </button>
          )}
        </div>
      )}

      {uiAction === "CREATE" && line.candidates.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No matches — switch to Manual or Skip.
        </p>
      )}

      {/* NEW_VERSION — add a version to the matched song from a recording */}
      {uiAction === "NEW_VERSION" && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            Adds a new version to <span className="font-medium">{existingName}</span>.
          </p>
          {line.candidates.length === 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || fetching}
              onClick={onFetchCandidates}
            >
              {fetching ? "Finding recordings…" : "Find recordings"}
            </Button>
          ) : (
            <div className="space-y-1">
              {(expanded ? line.candidates : line.candidates.slice(0, 1)).map(
                (cand, idx) => (
                  <CandidateItem
                    key={cand.appleTrackId ?? idx}
                    cand={cand}
                    checked={line.action === "NEW_VERSION" && selectedIdx === idx}
                    previewKey={`${line.id}:v:${idx}`}
                    player={player}
                    disabled={busy}
                    onSelect={() =>
                      apply({
                        lineId: line.id,
                        action: "NEW_VERSION",
                        existingSongId: line.existingSongId,
                        selectedCandidateIdx: idx,
                      })
                    }
                  />
                ),
              )}
              {line.candidates.length > 1 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  {expanded
                    ? "Show fewer"
                    : `Show ${line.candidates.length - 1} more recording(s)`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* LINK_EXISTING */}
      {uiAction === "LINK_EXISTING" && (
        <div className="mt-2">
          <select
            value={line.existingSongId ?? ""}
            disabled={busy}
            onChange={(e) =>
              apply({
                lineId: line.id,
                action: "LINK_EXISTING",
                existingSongId: e.target.value || null,
                selectedCandidateIdx: line.selectedCandidateIdx,
              })
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Existing song"
          >
            <option value="">Choose a song…</option>
            {existingSongs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.artist ? ` — ${s.artist}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* MANUAL */}
      {uiAction === "MANUAL" && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
            placeholder="Title"
            className="h-8"
            aria-label="Manual title"
          />
          <Input
            value={manualArtist}
            onChange={(e) => setManualArtist(e.target.value)}
            placeholder="Artist"
            className="h-8"
            aria-label="Manual artist"
          />
          <Input
            value={manualAlbum}
            onChange={(e) => setManualAlbum(e.target.value)}
            placeholder="Album"
            className="h-8"
            aria-label="Manual album"
          />
          <div className="sm:col-span-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !manualTitle.trim()}
              onClick={() =>
                apply({
                  lineId: line.id,
                  action: "MANUAL",
                  title: manualTitle.trim(),
                  artist: manualArtist.trim() || undefined,
                  album: manualAlbum.trim() || undefined,
                })
              }
            >
              Save manual entry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateItem({
  cand,
  checked,
  previewKey,
  player,
  disabled,
  onSelect,
}: {
  cand: TrackCandidate;
  checked: boolean;
  previewKey: string;
  player: ReturnType<typeof usePreviewPlayer>;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded border p-2 text-sm">
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="h-4 w-4"
      />
      {cand.artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cand.artworkUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{cand.title}</span>
        <span className="block truncate text-muted-foreground">
          {cand.artist}
          {cand.album ? ` · ${cand.album}` : ""}
          {cand.durationSec ? ` · ${fmtDuration(cand.durationSec)}` : ""}
        </span>
      </span>
      {cand.previewUrl && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => player.play(previewKey, cand.previewUrl!)}
        >
          {player.playing === previewKey ? "Pause" : "Preview"}
        </Button>
      )}
    </label>
  );
}
