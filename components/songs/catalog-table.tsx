"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { setUserSongStatus } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import type { CatalogRow, CatalogSort } from "@/lib/song-catalog";

const PLATFORM_LABEL: Record<string, string> = {
  SPOTIFY: "Spotify",
  YOUTUBE: "YouTube",
  APPLE_MUSIC: "Apple",
  SOUNDCLOUD: "SoundCloud",
  OTHER: "Link",
};

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CatalogTable({
  slug,
  rows,
  sort,
  order,
  page,
  pageCount,
}: {
  slug: string;
  rows: CatalogRow[];
  sort: CatalogSort;
  order: "asc" | "desc";
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  function sortHref(col: CatalogSort): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder = sort === col && order === "asc" ? "desc" : "asc";
    params.set("sort", col);
    params.set("order", nextOrder);
    return `${pathname}?${params.toString()}`;
  }

  function pageHref(p: number): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  async function update(
    songId: string,
    patch: { rehearsed?: boolean; performedCount?: number },
  ) {
    setPendingId(songId);
    const res = await setUserSongStatus({ songId, ...patch });
    setPendingId(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    router.refresh();
  }

  function SortHeader({ col, label }: { col: CatalogSort; label: string }) {
    const active = sort === col;
    const Icon = !active ? ArrowUpDown : order === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead>
        <Link href={sortHref(col)} className="inline-flex items-center gap-1 hover:text-foreground">
          {label}
          <Icon className="h-3.5 w-3.5" />
        </Link>
      </TableHead>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader col="title" label="Title" />
              <SortHeader col="artist" label="Artist" />
              <SortHeader col="album" label="Album" />
              <SortHeader col="trackNo" label="Track" />
              <SortHeader col="style" label="Style" />
              <SortHeader col="key" label="Key" />
              <SortHeader col="tempoBpm" label="BPM" />
              <SortHeader col="durationSec" label="Dur" />
              <SortHeader col="status" label="Status" />
              <SortHeader col="rehearsed" label="Rehearsed" />
              <SortHeader col="performed" label="Perf" />
              <TableHead>Links</TableHead>
              <SortHeader col="updatedAt" label="Updated" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/acts/${slug}/songs/${r.id}`} className="hover:underline">
                    {r.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.artist ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.album ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{r.trackNo ?? "—"}</TableCell>
                <TableCell>{r.style ?? "—"}</TableCell>
                <TableCell>{r.key ?? "—"}</TableCell>
                <TableCell>{r.tempoBpm ?? "—"}</TableCell>
                <TableCell>{fmtDuration(r.durationSec)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{r.status}</Badge>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={pendingId === r.id}
                    onClick={() => update(r.id, { rehearsed: !r.rehearsed })}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border"
                    aria-label="Toggle rehearsed"
                  >
                    {r.rehearsed ? <Check className="h-4 w-4 text-green-600" /> : null}
                  </button>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    disabled={pendingId === r.id}
                    onClick={() => update(r.id, { performedCount: r.performedCount + 1 })}
                    className="tabular-nums hover:underline"
                    title="Click to add one performance"
                  >
                    {r.performedCount}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {r.platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {PLATFORM_LABEL[p] ?? p}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(r.updatedAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground">
                  No songs match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={pageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= pageCount}>
              <Link href={pageHref(Math.min(pageCount, page + 1))}>Next</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
