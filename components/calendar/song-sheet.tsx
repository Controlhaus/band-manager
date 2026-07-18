"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Markdown } from "@/components/markdown";

export type SheetSong = {
  id: string;
  title: string;
  artist: string | null;
  lyrics: string | null;
  leadSheet: { id: string; mimeType: string } | null;
};

export function SongSheet({
  slug,
  songs,
  index,
  onIndexChange,
  onClose,
}: {
  slug: string;
  songs: SheetSong[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const [fullscreen, setFullscreen] = React.useState(false);
  const open = index !== null;
  const song = index !== null ? songs[index] : undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "w-full gap-0 p-0 sm:max-w-xl",
          fullscreen && "sm:max-w-none",
        )}
        style={fullscreen ? { width: "100vw", maxWidth: "100vw" } : undefined}
      >
        {song && (
          <>
            <SheetHeader className="flex-row items-center justify-between gap-2 border-b p-4">
              <div className="min-w-0">
                <SheetTitle className="truncate">{song.title}</SheetTitle>
                {song.artist && (
                  <p className="truncate text-sm text-muted-foreground">
                    {song.artist}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFullscreen((v) => !v)}
                  aria-label="Toggle full screen"
                >
                  {fullscreen ? <Minimize2 /> : <Maximize2 />}
                </Button>
                <Button asChild variant="ghost" size="icon" aria-label="Open song page">
                  <Link href={`/acts/${slug}/songs/${song.id}`}>
                    <ExternalLink />
                  </Link>
                </Button>
              </div>
            </SheetHeader>

            <div className="flex items-center justify-between border-b p-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => index !== null && onIndexChange(index - 1)}
              >
                <ChevronLeft /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {(index ?? 0) + 1} / {songs.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === songs.length - 1}
                onClick={() => index !== null && onIndexChange(index + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>

            <div
              className={cn(
                "flex-1 space-y-4 overflow-y-auto p-4",
                fullscreen && "mx-auto w-full max-w-5xl",
              )}
            >
              {song.leadSheet && (
                <div className="space-y-1">
                  <Badge variant="secondary">Lead sheet</Badge>
                  {song.leadSheet.mimeType === "application/pdf" ? (
                    <object
                      data={`/api/files/${song.leadSheet.id}`}
                      type="application/pdf"
                      className={cn("w-full rounded border", fullscreen ? "h-[70vh]" : "h-96")}
                    >
                      <a
                        href={`/api/files/${song.leadSheet.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Download lead sheet
                      </a>
                    </object>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/files/${song.leadSheet.id}`}
                      alt={`${song.title} lead sheet`}
                      className="w-full rounded border"
                    />
                  )}
                </div>
              )}

              <div>
                <h3 className="mb-1 text-sm font-semibold">Lyrics</h3>
                {song.lyrics ? (
                  <Markdown content={song.lyrics} />
                ) : (
                  <p className="text-sm text-muted-foreground">No lyrics.</p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
