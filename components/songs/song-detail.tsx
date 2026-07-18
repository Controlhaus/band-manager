"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  updateSong,
  deleteSong,
  retireSong,
  updateSongLyrics,
  upsertSongLink,
  deleteSongLink,
  upsertSongVersion,
  deleteSongVersion,
} from "@/app/actions/songs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/markdown";
import { FileUpload } from "@/components/files/file-upload";
import { FileList, type FileItem } from "@/components/files/file-list";
import { toast } from "@/hooks/use-toast";
import { SONG_PLATFORMS, SONG_STATUSES } from "@/lib/types";
import type { SongPlatform, SongStatus } from "@prisma/client";

type SongData = {
  id: string;
  title: string;
  artist: string | null;
  style: string | null;
  key: string | null;
  tempoBpm: number | null;
  durationSec: number | null;
  status: SongStatus;
  lyrics: string;
  notes: string;
};
type LinkData = {
  id: string;
  platform: SongPlatform;
  url: string;
  label: string | null;
  versionId: string | null;
};
type VersionData = {
  id: string;
  name: string;
  key: string | null;
  notes: string | null;
  files: FileItem[];
};

const PLATFORM_LABEL: Record<string, string> = {
  SPOTIFY: "Spotify",
  YOUTUBE: "YouTube",
  APPLE_MUSIC: "Apple Music",
  SOUNDCLOUD: "SoundCloud",
  OTHER: "Other",
};

export function SongDetail({
  slug,
  canWrite,
  song,
  links,
  versions,
  songFiles,
  myStatus,
}: {
  slug: string;
  canWrite: boolean;
  song: SongData;
  links: LinkData[];
  versions: VersionData[];
  songFiles: FileItem[];
  myStatus: { rehearsed: boolean; performedCount: number };
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{song.title}</h1>
          <p className="text-muted-foreground">
            {song.artist ?? "Unknown artist"}
            {song.style ? ` · ${song.style}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{song.status}</Badge>
          {myStatus.rehearsed && <Badge variant="secondary">Rehearsed</Badge>}
          {myStatus.performedCount > 0 && (
            <Badge variant="secondary">Performed ×{myStatus.performedCount}</Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
          <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
          <TabsTrigger value="links">Links &amp; files</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoSection slug={slug} canWrite={canWrite} song={song} />
        </TabsContent>

        <TabsContent value="lyrics">
          <LyricsSection songId={song.id} canWrite={canWrite} lyrics={song.lyrics} />
        </TabsContent>

        <TabsContent value="versions">
          <VersionsSection songId={song.id} canWrite={canWrite} versions={versions} />
        </TabsContent>

        <TabsContent value="links">
          <LinksAndFilesSection
            songId={song.id}
            canWrite={canWrite}
            links={links.filter((l) => !l.versionId)}
            files={songFiles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoSection({
  slug,
  canWrite,
  song,
}: {
  slug: string;
  canWrite: boolean;
  song: SongData;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [status, setStatus] = React.useState<SongStatus>(song.status);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    const res = await updateSong({
      songId: song.id,
      title: String(f.get("title") ?? ""),
      artist: String(f.get("artist") ?? "") || undefined,
      style: String(f.get("style") ?? "") || undefined,
      key: String(f.get("key") ?? "") || undefined,
      tempoBpm: f.get("tempoBpm") ? Number(f.get("tempoBpm")) : null,
      durationSec: f.get("durationSec") ? Number(f.get("durationSec")) : null,
      status,
      notes: String(f.get("notes") ?? "") || undefined,
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: "Saved" });
    router.refresh();
  }

  async function onDelete() {
    if (!confirm("Delete this song permanently?")) return;
    const res = await deleteSong({ songId: song.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Song deleted" });
    router.push(`/acts/${slug}/songs`);
  }

  async function onRetire() {
    const res = await retireSong({ songId: song.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not retire", description: res.error });
      return;
    }
    toast({ title: "Song retired" });
    router.refresh();
  }

  if (!canWrite) {
    return (
      <Card>
        <CardContent className="grid gap-2 p-6 text-sm sm:grid-cols-2">
          <Detail label="Artist" value={song.artist} />
          <Detail label="Style" value={song.style} />
          <Detail label="Key" value={song.key} />
          <Detail label="BPM" value={song.tempoBpm?.toString() ?? null} />
          <Detail label="Status" value={song.status} />
          {song.notes && (
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Notes</p>
              <Markdown content={song.notes} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="title" label="Title" defaultValue={song.title} required />
            <Field name="artist" label="Artist" defaultValue={song.artist ?? ""} />
            <Field name="style" label="Style" defaultValue={song.style ?? ""} />
            <Field name="key" label="Key" defaultValue={song.key ?? ""} />
            <Field name="tempoBpm" label="BPM" type="number" defaultValue={song.tempoBpm?.toString() ?? ""} />
            <Field name="durationSec" label="Duration (sec)" type="number" defaultValue={song.durationSec?.toString() ?? ""} />
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SongStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SONG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (markdown)</Label>
            <Textarea id="notes" name="notes" defaultValue={song.notes} rows={4} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {song.status !== "RETIRED" && (
              <Button type="button" variant="outline" onClick={onRetire}>
                Retire
              </Button>
            )}
            <Button type="button" variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LyricsSection({
  songId,
  canWrite,
  lyrics,
}: {
  songId: string;
  canWrite: boolean;
  lyrics: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(lyrics);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    const res = await updateSongLyrics({ songId, lyrics: value });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: "Lyrics saved" });
    setEditing(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Lyrics</CardTitle>
        {canWrite && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={16}
              className="font-mono"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setValue(lyrics);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : lyrics ? (
          <Markdown content={lyrics} />
        ) : (
          <p className="text-sm text-muted-foreground">No lyrics yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function VersionsSection({
  songId,
  canWrite,
  versions,
}: {
  songId: string;
  canWrite: boolean;
  versions: VersionData[];
}) {
  const router = useRouter();

  async function addVersion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await upsertSongVersion({
      songId,
      name: String(f.get("name") ?? ""),
      key: String(f.get("key") ?? "") || undefined,
      notes: String(f.get("notes") ?? "") || undefined,
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add version", description: res.error });
      return;
    }
    toast({ title: "Version added" });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function removeVersion(id: string) {
    if (!confirm("Delete this version?")) return;
    const res = await deleteSongVersion({ id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Version deleted" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add version</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addVersion} className="flex flex-wrap items-end gap-2">
              <Field name="name" label="Name" required className="min-w-40 flex-1" />
              <Field name="key" label="Key" className="w-24" />
              <Field name="notes" label="Notes" className="min-w-40 flex-1" />
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No versions yet.</p>
      ) : (
        versions.map((v) => (
          <Card key={v.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {v.name}
                {v.key && <span className="ml-2 text-sm text-muted-foreground">Key: {v.key}</span>}
              </CardTitle>
              {canWrite && (
                <Button variant="ghost" size="icon" onClick={() => removeVersion(v.id)} aria-label="Delete version">
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {v.notes && <Markdown content={v.notes} />}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Files</p>
                {canWrite && (
                  <FileUpload
                    entityType="SONG_VERSION"
                    entityId={v.id}
                    kind="LEAD_SHEET"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    label="Add lead sheet"
                  />
                )}
              </div>
              <FileList files={v.files} canManage={canWrite} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function LinksAndFilesSection({
  songId,
  canWrite,
  links,
  files,
}: {
  songId: string;
  canWrite: boolean;
  links: LinkData[];
  files: FileItem[];
}) {
  const router = useRouter();
  const [platform, setPlatform] = React.useState<SongPlatform>("SPOTIFY");

  async function addLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await upsertSongLink({
      songId,
      platform,
      url: String(f.get("url") ?? ""),
      label: String(f.get("label") ?? "") || undefined,
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add link", description: res.error });
      return;
    }
    toast({ title: "Link added" });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function removeLink(id: string) {
    const res = await deleteSongLink({ id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Streaming links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y rounded-md border">
            {links.length === 0 && (
              <li className="p-2 text-sm text-muted-foreground">No links.</li>
            )}
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 p-2">
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate hover:underline">
                  <Badge variant="secondary" className="mr-2">
                    {PLATFORM_LABEL[l.platform]}
                  </Badge>
                  {l.label ?? l.url}
                </a>
                {canWrite && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLink(l.id)} aria-label="Delete link">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canWrite && (
            <form onSubmit={addLink} className="space-y-2">
              <div className="flex gap-2">
                <Select value={platform} onValueChange={(v) => setPlatform(v as SongPlatform)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SONG_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input name="url" placeholder="https://…" required className="flex-1" />
              </div>
              <div className="flex gap-2">
                <Input name="label" placeholder="Label (optional)" className="flex-1" />
                <Button type="submit">Add link</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Lead sheets &amp; files</CardTitle>
          {canWrite && (
            <FileUpload
              entityType="SONG"
              entityId={songId}
              kind="LEAD_SHEET"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              label="Add file"
            />
          )}
        </CardHeader>
        <CardContent>
          <FileList files={files} canManage={canWrite} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p>{value ?? "—"}</p>
    </div>
  );
}
