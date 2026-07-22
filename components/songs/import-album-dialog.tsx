"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Disc3, Loader2, Search } from "lucide-react";
import {
  searchAlbum,
  getAlbumTracks,
  importAlbumTracks,
  type PreviewTrack,
} from "@/app/actions/music-import";
import type { ReleaseCandidate } from "@/lib/musicbrainz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDuration } from "@/lib/set-lists";

type Step = "search" | "release" | "tracks";

type AlbumData = {
  releaseMbid: string;
  album: string;
  artist: string;
  hasCoverArt: boolean;
  tracks: PreviewTrack[];
};

function releaseMeta(r: ReleaseCandidate): string {
  const parts = [
    r.year ? String(r.year) : null,
    r.country,
    `${r.trackCount} track${r.trackCount === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function ImportAlbumDialog({ actId }: { actId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>("search");
  const [pending, setPending] = React.useState(false);

  const [artist, setArtist] = React.useState("");
  const [album, setAlbum] = React.useState("");
  const [releases, setReleases] = React.useState<ReleaseCandidate[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [data, setData] = React.useState<AlbumData | null>(null);
  const [checked, setChecked] = React.useState<Set<number>>(new Set());

  function reset() {
    setStep("search");
    setPending(false);
    setArtist("");
    setAlbum("");
    setReleases([]);
    setSelected(null);
    setData(null);
    setChecked(new Set());
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await searchAlbum({ actId, artist, album });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Search failed", description: res.error });
      return;
    }
    if (!res.data || res.data.length === 0) {
      toast({ title: "No matches", description: "Try a different spelling." });
      return;
    }
    setReleases(res.data);
    setSelected(res.data[0]?.id ?? null);
    setStep("release");
  }

  async function onLoadTracks() {
    if (!selected) return;
    setPending(true);
    const res = await getAlbumTracks({ actId, releaseMbid: selected });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not load tracks", description: res.error });
      return;
    }
    if (!res.data) return;
    setData(res.data);
    // Pre-select tracks that aren't already in the catalog.
    setChecked(
      new Set(
        res.data.tracks.flatMap((t, i) => (t.exists ? [] : [i])),
      ),
    );
    setStep("tracks");
  }

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function onImport() {
    if (!data || checked.size === 0) return;
    setPending(true);
    const res = await importAlbumTracks({
      actId,
      album: data.album,
      artist: data.artist,
      releaseMbid: data.releaseMbid,
      hasCoverArt: data.hasCoverArt,
      tracks: [...checked].map((i) => {
        const t = data.tracks[i]!;
        return {
          title: t.title,
          trackNo: t.trackNo,
          durationSec: t.durationSec,
          style: t.style,
        };
      }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Import failed", description: res.error });
      return;
    }
    const { created, skipped } = res.data ?? { created: 0, skipped: 0 };
    toast({
      title: `Imported ${created} song${created === 1 ? "" : "s"}`,
      description: skipped > 0 ? `${skipped} already in the catalog were skipped.` : undefined,
    });
    onOpenChange(false);
    router.refresh();
  }

  const coverSrc = data?.hasCoverArt ? `/api/cover/${data.releaseMbid}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Disc3 /> Import album
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import an album</DialogTitle>
          <DialogDescription>
            Fetch a full tracklist from MusicBrainz and add it to your catalog.
          </DialogDescription>
        </DialogHeader>

        {step === "search" && (
          <form onSubmit={onSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mb-artist">Artist</Label>
              <Input
                id="mb-artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mb-album">Album</Label>
              <Input
                id="mb-album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Search />}
                Search
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "release" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pick the matching release.
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {releases.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-2 has-[:checked]:border-primary has-[:checked]:bg-accent"
                >
                  <input
                    type="radio"
                    name="release"
                    className="mt-1"
                    checked={selected === r.id}
                    onChange={() => setSelected(r.id)}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {r.artist} · {releaseMeta(r)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("search")} disabled={pending}>
                Back
              </Button>
              <Button onClick={onLoadTracks} disabled={pending || !selected}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Load tracks
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "tracks" && data && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {coverSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{data.album}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {data.artist}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adds Spotify + Apple Music search links to each track.
                </p>
              </div>
            </div>

            <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {data.tracks.map((t, i) => (
                <label
                  key={i}
                  className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox
                    checked={checked.has(i)}
                    onCheckedChange={() => toggle(i)}
                  />
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.trackNo ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  {t.exists && (
                    <Badge variant="secondary" className="text-[10px]">
                      In catalog
                    </Badge>
                  )}
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t.durationSec != null ? formatDuration(t.durationSec) : "—"}
                  </span>
                </label>
              ))}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setStep("release")} disabled={pending}>
                Back
              </Button>
              <Button onClick={onImport} disabled={pending || checked.size === 0}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Import {checked.size} song{checked.size === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
