"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createSong } from "@/app/actions/songs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { parseDuration } from "@/lib/set-lists";

export function CreateSongDialog({
  actId,
  slug,
}: {
  actId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const tempo = form.get("tempoBpm");
    const trackNoRaw = form.get("trackNo");
    const lengthRaw = String(form.get("length") ?? "").trim();
    const durationSec = lengthRaw ? parseDuration(lengthRaw) : null;
    if (lengthRaw && durationSec === null) {
      toast({ variant: "destructive", title: "Invalid length", description: "Use mm:ss." });
      return;
    }
    setPending(true);
    const res = await createSong({
      actId,
      title: String(form.get("title") ?? ""),
      artist: String(form.get("artist") ?? "") || undefined,
      album: String(form.get("album") ?? "") || undefined,
      trackNo: trackNoRaw ? Number(trackNoRaw) : undefined,
      style: String(form.get("style") ?? "") || undefined,
      key: String(form.get("key") ?? "") || undefined,
      tempoBpm: tempo ? Number(tempo) : undefined,
      durationSec: durationSec ?? undefined,
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not create song", description: res.error });
      return;
    }
    toast({ title: "Song created" });
    setOpen(false);
    if (res.data?.id) router.push(`/acts/${slug}/songs/${res.data.id}`);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New song
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a song</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="artist">Artist</Label>
              <Input id="artist" name="artist" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="album">Album</Label>
              <Input id="album" name="album" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackNo">Track #</Label>
              <Input id="trackNo" name="trackNo" type="number" min={1} max={999} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Style</Label>
              <Input id="style" name="style" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key">Key</Label>
              <Input id="key" name="key" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempoBpm">BPM</Label>
              <Input id="tempoBpm" name="tempoBpm" type="number" min={20} max={400} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="length">Length (mm:ss)</Label>
              <Input id="length" name="length" placeholder="3:45" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create song"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
