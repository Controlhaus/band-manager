"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ExternalLink, GripVertical, MessageSquare, Music, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  updateSetList,
  createSet,
  updateSet,
  deleteSet,
  addSetSong,
  addSetAlbum,
  addSetBanter,
  updateSetEntry,
  removeSetEntry,
  reorderSetEntries,
  addSetListLink,
  removeSetListLink,
  addSetLink,
  removeSetLink,
} from "@/app/actions/set-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { formatDuration, parseDuration } from "@/lib/set-lists";
import type { SetEntryKind } from "@prisma/client";

export type PlaylistLinkVM = {
  id: string;
  url: string;
  label: string | null;
};
export type SetEntryVM = {
  id: string;
  kind: SetEntryKind;
  notes: string | null;
  songId: string | null;
  title: string | null;
  artist: string | null;
  songDurationSec: number | null;
  banterDescription: string | null;
  banterSeconds: number | null;
};
export type SetVM = {
  id: string;
  name: string;
  notes: string | null;
  links: PlaylistLinkVM[];
  entries: SetEntryVM[];
};
export type CatalogSong = {
  id: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  album: string | null;
};
type BookingRef = { id: string; title: string; href: string };

function entrySeconds(e: SetEntryVM): number {
  return e.kind === "BANTER" ? e.banterSeconds ?? 0 : e.songDurationSec ?? 0;
}
function sumSeconds(entries: SetEntryVM[]): number {
  return entries.reduce((sum, e) => sum + entrySeconds(e), 0);
}

export function SetListEditor({
  slug,
  canWrite,
  setList,
  sets,
  catalog,
  bookings,
}: {
  slug: string;
  canWrite: boolean;
  setList: { id: string; name: string; notes: string | null; links: PlaylistLinkVM[] };
  sets: SetVM[];
  catalog: CatalogSong[];
  bookings: BookingRef[];
}) {
  const router = useRouter();
  const [editingMeta, setEditingMeta] = React.useState(false);
  const [name, setName] = React.useState(setList.name);
  const [notes, setNotes] = React.useState(setList.notes ?? "");
  const [pending, setPending] = React.useState(false);

  const total = sets.reduce((sum, s) => sum + sumSeconds(s.entries), 0);

  async function saveMeta() {
    setPending(true);
    const res = await updateSetList({ setListId: setList.id, name, notes: notes || undefined });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    setEditingMeta(false);
    router.refresh();
  }

  async function addSet() {
    const res = await createSet({ setListId: setList.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add set", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/acts/${slug}/setlists`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> All set lists
      </Link>

      <Card>
        <CardHeader className="space-y-3">
          {editingMeta ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="sl-name">Name</Label>
                <Input id="sl-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {/* Notes always shown while editing, even when empty. */}
              <div className="space-y-2">
                <Label htmlFor="sl-notes">Notes (optional)</Label>
                <Textarea id="sl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveMeta} disabled={pending || !name.trim()}>
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setName(setList.name);
                    setNotes(setList.notes ?? "");
                    setEditingMeta(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">{setList.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {sets.length} set{sets.length === 1 ? "" : "s"} · {formatDuration(total)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatDuration(total)}</Badge>
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={() => setEditingMeta(true)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                </div>
              </div>
              {/* View mode: notes only render when present. */}
              {setList.notes && (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{setList.notes}</p>
              )}
              {bookings.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Used in booking: </span>
                  {bookings.map((b, i) => (
                    <React.Fragment key={b.id}>
                      {i > 0 && ", "}
                      <Link href={b.href} className="hover:underline">
                        {b.title}
                      </Link>
                    </React.Fragment>
                  ))}
                </div>
              )}
              <PlaylistLinks
                links={setList.links}
                canWrite={canWrite}
                onAdd={(url, label) => addSetListLink({ setListId: setList.id, url, label })}
                onRemove={(linkId) => removeSetListLink({ linkId })}
              />
            </>
          )}
        </CardHeader>
      </Card>

      {sets.map((s) => (
        <SetCard key={s.id} slug={slug} set={s} catalog={catalog} canWrite={canWrite} />
      ))}

      {canWrite && (
        <Button variant="outline" onClick={addSet}>
          <Plus /> Add set
        </Button>
      )}
    </div>
  );
}

function PlaylistLinks({
  links,
  canWrite,
  onAdd,
  onRemove,
}: {
  links: PlaylistLinkVM[];
  canWrite: boolean;
  onAdd: (url: string, label?: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: (linkId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function add() {
    setPending(true);
    const res = await onAdd(url.trim(), label.trim() || undefined);
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add link", description: res.error });
      return;
    }
    setUrl("");
    setLabel("");
    setOpen(false);
    router.refresh();
  }

  async function remove(linkId: string) {
    const res = await onRemove(linkId);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not remove link", description: res.error });
      return;
    }
    router.refresh();
  }

  if (links.length === 0 && !canWrite) return null;

  return (
    <div className="space-y-1">
      {links.length > 0 && (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {l.label || l.url}
              </a>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => remove(l.id)}
                  aria-label="Remove link"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" /> Playlist link
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/…"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Spotify"
              />
            </div>
            <Button size="sm" className="w-full" onClick={add} disabled={pending || !url.trim()}>
              {pending ? "Adding…" : "Add link"}
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function SetCard({
  slug,
  set,
  catalog,
  canWrite,
}: {
  slug: string;
  set: SetVM;
  catalog: CatalogSong[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(set.entries);
  React.useEffect(() => setItems(set.entries), [set.entries]);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(set.name);
  const [notes, setNotes] = React.useState(set.notes ?? "");

  const total = sumSeconds(items);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    const res = await reorderSetEntries({
      setId: set.id,
      orderedEntryIds: next.map((i) => i.id),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not reorder", description: res.error });
      setItems(set.entries);
    }
  }

  async function saveMeta() {
    const res = await updateSet({ setId: set.id, name, notes: notes || undefined });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this set?")) return;
    const res = await deleteSet({ setId: set.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        {editing ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Set name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveMeta} disabled={!name.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(set.name);
                  setNotes(set.notes ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{set.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} item{items.length === 1 ? "" : "s"} · {formatDuration(total)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{formatDuration(total)}</Badge>
                {canWrite && (
                  <>
                    <AddEntryPopover setId={set.id} catalog={catalog} />
                    <AddAlbumPopover setId={set.id} catalog={catalog} />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete set">
                      <Trash2 className="text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {set.notes && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{set.notes}</p>
            )}
          </>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in this set.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1">
                {items.map((it, index) => (
                  <SortableEntry key={it.id} slug={slug} item={it} index={index} canWrite={canWrite} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
        <div className="mt-3">
          <PlaylistLinks
            links={set.links}
            canWrite={canWrite}
            onAdd={(url, label) => addSetLink({ setId: set.id, url, label })}
            onRemove={(linkId) => removeSetLink({ linkId })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SortableEntry({
  slug,
  item,
  index,
  canWrite,
}: {
  slug: string;
  item: SetEntryVM;
  index: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [editingNote, setEditingNote] = React.useState(false);

  const label =
    item.kind === "BANTER" ? item.banterDescription ?? "Banter" : item.title ?? "Untitled";
  const seconds = entrySeconds(item);

  async function saveNote(notes: string) {
    const res = await updateSetEntry({ entryId: item.id, notes });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save note", description: res.error });
      return;
    }
    setEditingNote(false);
    router.refresh();
  }

  async function remove() {
    const res = await removeSetEntry({ entryId: item.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not remove", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border p-2 ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        {canWrite && (
          <button
            type="button"
            className="cursor-grab text-muted-foreground"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span>
        {item.kind === "BANTER" ? (
          <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1 truncate">
          {item.kind === "SONG" && item.songId ? (
            <Link
              href={`/acts/${slug}/songs/${item.songId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {label}
            </Link>
          ) : (
            label
          )}
          {item.kind === "SONG" && item.artist && (
            <span className="text-muted-foreground"> — {item.artist}</span>
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {seconds > 0 ? formatDuration(seconds) : "—"}
        </span>
        {canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditingNote((v) => !v)}>
              Note
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={remove} aria-label="Remove item">
              <X className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {item.notes && !editingNote && (
        <p className="mt-1 pl-9 text-xs text-muted-foreground">{item.notes}</p>
      )}
      {editingNote && (
        <div className="mt-2 space-y-2 pl-9">
          <Textarea defaultValue={item.notes ?? ""} rows={2} id={`note-${item.id}`} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                saveNote(
                  (document.getElementById(`note-${item.id}`) as HTMLTextAreaElement)?.value ?? "",
                )
              }
            >
              Save note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingNote(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddEntryPopover({
  setId,
  catalog,
}: {
  setId: string;
  catalog: CatalogSong[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"song" | "banter">("song");
  const [q, setQ] = React.useState("");
  const [banterDesc, setBanterDesc] = React.useState("");
  const [banterTime, setBanterTime] = React.useState("");

  const trimmed = q.trim();
  const filtered = catalog
    .filter(
      (s) =>
        s.title.toLowerCase().includes(trimmed.toLowerCase()) ||
        (s.artist ?? "").toLowerCase().includes(trimmed.toLowerCase()),
    )
    .slice(0, 50);
  const exactMatch = catalog.some((s) => s.title.toLowerCase() === trimmed.toLowerCase());

  async function addExisting(songId: string) {
    const res = await addSetSong({ setId, songId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add song", description: res.error });
      return;
    }
    reset();
    router.refresh();
  }

  async function addNew() {
    const res = await addSetSong({ setId, title: trimmed });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add song", description: res.error });
      return;
    }
    toast({ title: "Song added to library and set" });
    reset();
    router.refresh();
  }

  async function addBanter() {
    const seconds = banterTime ? parseDuration(banterTime) : null;
    if (banterTime && seconds === null) {
      toast({ variant: "destructive", title: "Invalid time", description: "Use mm:ss." });
      return;
    }
    const res = await addSetBanter({ setId, description: banterDesc, seconds });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add banter", description: res.error });
      return;
    }
    reset();
    router.refresh();
  }

  function reset() {
    setOpen(false);
    setQ("");
    setBanterDesc("");
    setBanterTime("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Add Song
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="mb-2 flex gap-1">
          <Button
            size="sm"
            variant={tab === "song" ? "secondary" : "ghost"}
            className="flex-1"
            onClick={() => setTab("song")}
          >
            Song
          </Button>
          <Button
            size="sm"
            variant={tab === "banter" ? "secondary" : "ghost"}
            className="flex-1"
            onClick={() => setTab("banter")}
          >
            Banter
          </Button>
        </div>

        {tab === "song" ? (
          <>
            <Input
              autoFocus
              placeholder="Search or type a new song…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addExisting(s.id)}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {s.title}
                  {s.artist && <span className="text-muted-foreground"> — {s.artist}</span>}
                </button>
              ))}
              {trimmed && !exactMatch && (
                <button
                  type="button"
                  onClick={addNew}
                  className="mt-1 block w-full rounded px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
                >
                  <Plus className="mr-1 inline h-3 w-3" />
                  Create &ldquo;{trimmed}&rdquo; in library
                </button>
              )}
              {filtered.length === 0 && !trimmed && (
                <p className="p-2 text-sm text-muted-foreground">Type to search or add.</p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                autoFocus
                value={banterDesc}
                onChange={(e) => setBanterDesc(e.target.value)}
                placeholder="e.g. Intro / band intros"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Time (mm:ss, optional)</Label>
              <Input
                value={banterTime}
                onChange={(e) => setBanterTime(e.target.value)}
                placeholder="1:30"
              />
            </div>
            <Button size="sm" className="w-full" onClick={addBanter} disabled={!banterDesc.trim()}>
              Add banter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AddAlbumPopover({
  setId,
  catalog,
}: {
  setId: string;
  catalog: CatalogSong[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);

  const albums = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of catalog) {
      const album = s.album?.trim();
      if (!album) continue;
      counts.set(album, (counts.get(album) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([album, count]) => ({ album, count }))
      .sort((a, b) => a.album.localeCompare(b.album));
  }, [catalog]);

  const trimmed = q.trim().toLowerCase();
  const filtered = albums.filter((a) => a.album.toLowerCase().includes(trimmed));

  async function addAlbum(album: string) {
    setPending(album);
    const res = await addSetAlbum({ setId, album });
    setPending(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add album", description: res.error });
      return;
    }
    setOpen(false);
    setQ("");
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Add album
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        {albums.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No albums in the library.</p>
        ) : (
          <>
            <Input
              autoFocus
              placeholder="Search albums…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto">
              {filtered.map((a) => (
                <button
                  key={a.album}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => addAlbum(a.album)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="truncate">{a.album}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.count} song{a.count === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No matching albums.</p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
