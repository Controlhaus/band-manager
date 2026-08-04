"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createSongImportSession,
  resolveSongImportSession,
} from "@/app/actions/song-import";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const MAX_LINES = 200;

export function ImportPasteForm({
  actId,
  slug,
}: {
  actId: string;
  slug: string;
}) {
  const router = useRouter();
  const [raw, setRaw] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const lineCount = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
  const tooMany = lineCount > MAX_LINES;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    const res = await createSongImportSession({ actId, rawInput: raw });
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
    // Kick off resolution, then move to the review page (which polls progress).
    await resolveSongImportSession({ sessionId });
    router.push(`/acts/${slug}/songs/import/${sessionId}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={14}
        placeholder={"Bohemian Rhapsody - Queen\nWonderwall - Oasis\nHotel California - Eagles"}
        className="font-mono text-sm"
        aria-label="Songs to import"
      />
      <div className="flex items-center justify-between text-sm">
        <span className={tooMany ? "text-destructive" : "text-muted-foreground"}>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
          {tooMany ? ` (max ${MAX_LINES})` : ""}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/acts/${slug}/songs`)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending || tooMany}>
            {pending ? "Starting…" : "Look up songs"}
          </Button>
        </div>
      </div>
    </form>
  );
}
