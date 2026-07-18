"use client";
import * as React from "react";
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
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import {
  createSetlist,
  deleteSetlist,
  updateSetlist,
  addSetlistItem,
  removeSetlistItem,
  updateSetlistItem,
  reorderSetlistItems,
} from "@/app/actions/setlists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { SongSheet, type SheetSong } from "./song-sheet";

export type SetlistItemVM = {
  id: string;
  songId: string;
  songVersionId: string | null;
  notes: string | null;
  title: string;
  artist: string | null;
};
export type SetlistVM = {
  id: string;
  name: string;
  items: SetlistItemVM[];
};
export type CatalogSong = {
  id: string;
  title: string;
  artist: string | null;
};
export type SongMeta = {
  lyrics: string | null;
  leadSheet: { id: string; mimeType: string } | null;
};

export function SetlistEditor({
  entryId,
  slug,
  canWrite,
  setlists,
  catalog,
  songMeta,
}: {
  entryId: string;
  slug: string;
  canWrite: boolean;
  setlists: SetlistVM[];
  catalog: CatalogSong[];
  songMeta: Record<string, SongMeta>;
}) {
  const router = useRouter();
  const [sheet, setSheet] = React.useState<{ setlistId: string; index: number } | null>(
    null,
  );

  const activeSetlist = setlists.find((s) => s.id === sheet?.setlistId);
  const sheetSongs: SheetSong[] =
    activeSetlist?.items.map((it) => ({
      id: it.songId,
      title: it.title,
      artist: it.artist,
      lyrics: songMeta[it.songId]?.lyrics ?? null,
      leadSheet: songMeta[it.songId]?.leadSheet ?? null,
    })) ?? [];

  async function addList() {
    const res = await createSetlist({ entryId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add set", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Setlists</h2>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={addList}>
            <Plus /> Add set
          </Button>
        )}
      </div>

      {setlists.length === 0 && (
        <p className="text-sm text-muted-foreground">No setlists yet.</p>
      )}

      {setlists.map((sl) => (
        <SetlistCard
          key={sl.id}
          setlist={sl}
          catalog={catalog}
          canWrite={canWrite}
          onOpenItem={(index) => setSheet({ setlistId: sl.id, index })}
        />
      ))}

      <SongSheet
        slug={slug}
        songs={sheetSongs}
        index={sheet?.index ?? null}
        onIndexChange={(i) =>
          setSheet((s) => (s ? { ...s, index: i } : s))
        }
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

function SetlistCard({
  setlist,
  catalog,
  canWrite,
  onOpenItem,
}: {
  setlist: SetlistVM;
  catalog: CatalogSong[];
  canWrite: boolean;
  onOpenItem: (index: number) => void;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(setlist.items);
  React.useEffect(() => setItems(setlist.items), [setlist.items]);

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
    const res = await reorderSetlistItems({
      setlistId: setlist.id,
      orderedItemIds: next.map((i) => i.id),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not reorder", description: res.error });
      setItems(setlist.items);
    }
  }

  async function rename(name: string) {
    if (name === setlist.name || !name.trim()) return;
    const res = await updateSetlist({ setlistId: setlist.id, name });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not rename", description: res.error });
    }
  }

  async function remove() {
    if (!confirm("Delete this set?")) return;
    const res = await deleteSetlist({ setlistId: setlist.id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    router.refresh();
  }

  async function addSong(songId: string) {
    const res = await addSetlistItem({ setlistId: setlist.id, songId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add song", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        {canWrite ? (
          <input
            defaultValue={setlist.name}
            onBlur={(e) => rename(e.target.value)}
            className="w-48 rounded border bg-transparent px-2 py-1 text-sm font-semibold"
          />
        ) : (
          <span className="font-semibold">{setlist.name}</span>
        )}
        {canWrite && (
          <div className="flex items-center gap-2">
            <AddSongPopover catalog={catalog} onAdd={addSong} />
            <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete set">
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No songs in this set.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-1">
                {items.map((it, index) => (
                  <SortableRow
                    key={it.id}
                    item={it}
                    index={index}
                    canWrite={canWrite}
                    onOpen={() => onOpenItem(index)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

function SortableRow({
  item,
  index,
  canWrite,
  onOpen,
}: {
  item: SetlistItemVM;
  index: number;
  canWrite: boolean;
  onOpen: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const [editingNote, setEditingNote] = React.useState(false);

  async function saveNote(notes: string) {
    const res = await updateSetlistItem({ itemId: item.id, notes });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save note", description: res.error });
      return;
    }
    setEditingNote(false);
    router.refresh();
  }

  async function remove() {
    const res = await removeSetlistItem({ itemId: item.id });
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
        <button type="button" onClick={onOpen} className="flex-1 truncate text-left hover:underline">
          {item.title}
          {item.artist && <span className="text-muted-foreground"> — {item.artist}</span>}
        </button>
        {canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditingNote((v) => !v)}>
              Note
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={remove} aria-label="Remove song">
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

function AddSongPopover({
  catalog,
  onAdd,
}: {
  catalog: CatalogSong[];
  onAdd: (songId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const filtered = catalog
    .filter(
      (s) =>
        s.title.toLowerCase().includes(q.toLowerCase()) ||
        (s.artist ?? "").toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 50);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Add song
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          autoFocus
          placeholder="Search songs…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No matches.</p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onAdd(s.id);
                  setOpen(false);
                  setQ("");
                }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {s.title}
                {s.artist && <span className="text-muted-foreground"> — {s.artist}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
