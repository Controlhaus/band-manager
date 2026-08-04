"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  PLATFORM_LABEL,
  PLAYLIST_PLATFORMS,
  type PlaylistPlatform,
} from "@/lib/platform-links";

export type ShareLinkVM = {
  id: string;
  platform: PlaylistPlatform;
  url: string;
  label: string | null;
};

export type ShareTrack = {
  title: string;
  artist: string | null;
};

/**
 * §18.12 — sharing tools for a setlist: copy a plain tracklist, export files,
 * and manage manually-pasted playlist links (host-validated server-side).
 */
export function SetlistShareBar({
  exportBasePath,
  tracks,
  links,
  canWrite,
  onAddLink,
  onDeleteLink,
}: {
  /** e.g. `/api/setlists/{id}` or `/api/set-lists/{id}` (export appended). */
  exportBasePath: string;
  tracks: ShareTrack[];
  links: ShareLinkVM[];
  canWrite: boolean;
  onAddLink: (platform: PlaylistPlatform, url: string) => Promise<{ ok: boolean; error?: string }>;
  onDeleteLink: (linkId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();

  async function copyTracklist() {
    const text = tracks
      .map((t) => (t.artist ? `${t.artist} - ${t.title}` : t.title))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Tracklist copied" });
    } catch {
      toast({ variant: "destructive", title: "Could not copy" });
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copyTracklist} disabled={tracks.length === 0}>
          <Copy className="h-4 w-4" /> Copy tracklist
        </Button>
        {(["m3u", "csv", "txt"] as const).map((fmt) => (
          <Button key={fmt} asChild size="sm" variant="outline">
            <a href={`${exportBasePath}/export?format=${fmt}`}>
              <Download className="h-4 w-4" /> {fmt.toUpperCase()}
            </a>
          </Button>
        ))}
        {canWrite && (
          <AddLinkPopover
            onAdd={async (platform, url) => {
              const res = await onAddLink(platform, url);
              if (!res.ok) {
                toast({ variant: "destructive", title: "Could not add link", description: res.error });
                return false;
              }
              toast({ title: "Playlist link added" });
              router.refresh();
              return true;
            }}
          />
        )}
      </div>

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label ?? PLATFORM_LABEL[link.platform]}
              </a>
              {canWrite && (
                <button
                  type="button"
                  aria-label="Remove link"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    const res = await onDeleteLink(link.id);
                    if (!res.ok) {
                      toast({ variant: "destructive", title: "Could not remove", description: res.error });
                      return;
                    }
                    router.refresh();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddLinkPopover({
  onAdd,
}: {
  onAdd: (platform: PlaylistPlatform, url: string) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [platform, setPlatform] = React.useState<PlaylistPlatform>("SPOTIFY");
  const [url, setUrl] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function submit() {
    if (!url.trim()) return;
    setPending(true);
    const ok = await onAdd(platform, url.trim());
    setPending(false);
    if (ok) {
      setUrl("");
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Playlist link
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <Select value={platform} onValueChange={(v) => setPlatform(v as PlaylistPlatform)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYLIST_PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          aria-label="Playlist URL"
        />
        <Button size="sm" className="w-full" onClick={submit} disabled={pending || !url.trim()}>
          {pending ? "Adding…" : "Add link"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
