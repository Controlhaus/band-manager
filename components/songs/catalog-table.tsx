"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Pencil, X } from "lucide-react";
import { setUserSongStatus } from "@/app/actions/profile";
import { updateSongCatalogFields } from "@/app/actions/songs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatDuration, parseDuration } from "@/lib/set-lists";
import type { CatalogRow, CatalogSort } from "@/lib/song-catalog";
import type { SongStatus } from "@prisma/client";

const STATUS_OPTIONS: SongStatus[] = [
  "IDEA",
  "REHEARSING",
  "REHEARSED",
  "PERFORMED",
  "RETIRED",
];

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
  canWrite,
}: {
  slug: string;
  rows: CatalogRow[];
  sort: CatalogSort;
  order: "asc" | "desc";
  page: number;
  pageCount: number;
  canWrite: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
              <SortHeader col="updatedAt" label="Updated" />
              {canWrite && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <SongRow key={r.id} slug={slug} r={r} canWrite={canWrite} />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={canWrite ? 13 : 12} className="text-center text-muted-foreground">
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

function SongRow({
  slug,
  r,
  canWrite,
}: {
  slug: string;
  r: CatalogRow;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [style, setStyle] = React.useState(r.style ?? "");
  const [key, setKey] = React.useState(r.key ?? "");
  const [bpm, setBpm] = React.useState(r.tempoBpm?.toString() ?? "");
  const [dur, setDur] = React.useState(
    r.durationSec != null ? formatDuration(r.durationSec) : "",
  );
  const [status, setStatus] = React.useState<SongStatus>(r.status as SongStatus);

  function resetDraft() {
    setStyle(r.style ?? "");
    setKey(r.key ?? "");
    setBpm(r.tempoBpm?.toString() ?? "");
    setDur(r.durationSec != null ? formatDuration(r.durationSec) : "");
    setStatus(r.status as SongStatus);
  }

  async function updateUserStatus(patch: {
    rehearsed?: boolean;
    performedCount?: number;
  }) {
    setPending(true);
    const res = await setUserSongStatus({ songId: r.id, ...patch });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    router.refresh();
  }

  async function save() {
    const bpmNum = bpm.trim() ? Number(bpm.trim()) : null;
    if (bpm.trim() && (!Number.isInteger(bpmNum) || bpmNum! < 20 || bpmNum! > 400)) {
      toast({ variant: "destructive", title: "Invalid BPM", description: "Use 20–400." });
      return;
    }
    const durSec = dur.trim() ? parseDuration(dur.trim()) : null;
    if (dur.trim() && durSec === null) {
      toast({ variant: "destructive", title: "Invalid duration", description: "Use mm:ss." });
      return;
    }
    setPending(true);
    const res = await updateSongCatalogFields({
      songId: r.id,
      style: style.trim() || null,
      key: key.trim() || null,
      tempoBpm: bpmNum,
      durationSec: durSec,
      status,
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    setEditing(false);
    toast({ title: "Saved" });
    router.refresh();
  }

  function cancel() {
    resetDraft();
    setEditing(false);
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link href={`/acts/${slug}/songs/${r.id}`} className="flex items-center gap-2 hover:underline">
          {r.title}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{r.artist ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{r.album ?? "—"}</TableCell>
      <TableCell className="tabular-nums">{r.trackNo ?? "—"}</TableCell>
      {editing ? (
        <>
          <TableCell>
            <Input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="h-8 w-24"
              aria-label="Style"
            />
          </TableCell>
          <TableCell>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-8 w-16"
              aria-label="Key"
            />
          </TableCell>
          <TableCell>
            <Input
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              inputMode="numeric"
              className="h-8 w-16"
              aria-label="BPM"
            />
          </TableCell>
          <TableCell>
            <Input
              value={dur}
              onChange={(e) => setDur(e.target.value)}
              placeholder="mm:ss"
              className="h-8 w-16"
              aria-label="Duration"
            />
          </TableCell>
          <TableCell>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SongStatus)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell>{r.style ?? "—"}</TableCell>
          <TableCell>{r.key ?? "—"}</TableCell>
          <TableCell>{r.tempoBpm ?? "—"}</TableCell>
          <TableCell>{fmtDuration(r.durationSec)}</TableCell>
          <TableCell>
            <Badge variant="outline">{r.status}</Badge>
          </TableCell>
        </>
      )}
      <TableCell>
        <button
          type="button"
          disabled={pending}
          onClick={() => updateUserStatus({ rehearsed: !r.rehearsed })}
          className="inline-flex h-6 w-6 items-center justify-center rounded border"
          aria-label="Toggle rehearsed"
        >
          {r.rehearsed ? <Check className="h-4 w-4 text-green-600" /> : null}
        </button>
      </TableCell>
      <TableCell>
        <button
          type="button"
          disabled={pending}
          onClick={() => updateUserStatus({ performedCount: r.performedCount + 1 })}
          className="tabular-nums hover:underline"
          title="Click to add one performance"
        >
          {r.performedCount}
        </button>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {new Date(r.updatedAt).toLocaleDateString()}
      </TableCell>
      {canWrite && (
        <TableCell className="whitespace-nowrap">
          {editing ? (
            <div className="flex items-center gap-1">
              <Button size="icon" className="h-7 w-7" onClick={save} disabled={pending} aria-label="Save">
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={cancel}
                disabled={pending}
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setEditing(true)}
              aria-label="Edit song"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}
