"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import {
  createSongImportSession,
  resolveSongImportSession,
} from "@/app/actions/song-import";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

const MAX_LINES = 200;

/**
 * Paste-import songs directly into a set. Reuses the shared review flow, passing
 * the set as the import target so committed songs are appended to it (§19).
 */
export function ImportSetDialog({
  actId,
  setId,
  slug,
}: {
  actId: string;
  setId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const lineCount = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
  const tooMany = lineCount > MAX_LINES;

  async function onSubmit() {
    if (!raw.trim()) {
      toast({ variant: "destructive", title: "Paste some songs first." });
      return;
    }
    if (tooMany) {
      toast({
        variant: "destructive",
        title: "Too many lines",
        description: `The limit is ${MAX_LINES}.`,
      });
      return;
    }
    setPending(true);
    const res = await createSongImportSession({ actId, rawInput: raw, targetSetId: setId });
    if (!res.ok) {
      setPending(false);
      toast({ variant: "destructive", title: "Could not start import", description: res.error });
      return;
    }
    const { sessionId } = res.data ?? {};
    if (!sessionId) {
      setPending(false);
      toast({ variant: "destructive", title: "Could not start import" });
      return;
    }
    await resolveSongImportSession({ sessionId });
    router.push(`/acts/${slug}/songs/import/${sessionId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload /> Import Songs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import songs into this set</DialogTitle>
          <DialogDescription>
            Paste one song per line (e.g. <code>Title, Artist</code> or{" "}
            <code>Artist - Title</code>). You&rsquo;ll review matches before anything is added.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={12}
          placeholder={"Bohemian Rhapsody - Queen\nWonderwall - Oasis\nHotel California - Eagles"}
          className="font-mono text-sm"
          aria-label="Songs to import"
        />
        <span className={tooMany ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
          {tooMany ? ` (max ${MAX_LINES})` : ""}
        </span>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending || tooMany}>
            {pending ? "Starting…" : "Look up songs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
