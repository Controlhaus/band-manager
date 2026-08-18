"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare } from "lucide-react";
import { setEntrySetList } from "@/app/actions/setlists";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/set-lists";
import { toast } from "@/hooks/use-toast";

export type EntrySetListEntryVM = {
  id: string;
  kind: "SONG" | "BANTER";
  title: string | null;
  artist: string | null;
  banterDescription: string | null;
  banterSeconds: number | null;
  songDurationSec: number | null;
};
export type EntrySetListSetVM = {
  id: string;
  name: string;
  entries: EntrySetListEntryVM[];
};
export type EntrySetListVM = {
  id: string;
  name: string;
  notes: string | null;
  sets: EntrySetListSetVM[];
};

function entrySeconds(e: EntrySetListEntryVM): number {
  return e.kind === "BANTER" ? e.banterSeconds ?? 0 : e.songDurationSec ?? 0;
}

export function EntrySetList({
  entryId,
  slug,
  canWrite,
  setLists,
  current,
}: {
  entryId: string;
  slug: string;
  canWrite: boolean;
  setLists: { id: string; name: string }[];
  current: EntrySetListVM | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onChange(value: string) {
    const setListId = value === "none" ? null : value;
    setPending(true);
    const res = await setEntrySetList({ entryId, setListId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update set list", description: res.error });
      return;
    }
    router.refresh();
  }

  const total =
    current?.sets.reduce(
      (sum, s) => sum + s.entries.reduce((a, e) => a + entrySeconds(e), 0),
      0,
    ) ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Set list</CardTitle>
        {canWrite && (
          <Select value={current?.id ?? "none"} onValueChange={onChange} disabled={pending}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {setLists.map((sl) => (
                <SelectItem key={sl.id} value={sl.id}>
                  {sl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!current ? (
          <p className="text-sm text-muted-foreground">No set list attached.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/acts/${slug}/setlists/${current.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {current.name} <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <span className="text-sm text-muted-foreground">{formatDuration(total)}</span>
            </div>
            {current.notes && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{current.notes}</p>
            )}
            {current.sets.map((s) => {
              const setTotal = s.entries.reduce((a, e) => a + entrySeconds(e), 0);
              let songNo = 0;
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between border-b pb-1">
                    <span className="text-sm font-semibold">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{formatDuration(setTotal)}</span>
                  </div>
                  {s.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No songs in this set.</p>
                  ) : (
                    <ol className="space-y-0.5">
                      {s.entries.map((e) =>
                        e.kind === "BANTER" ? (
                          <li
                            key={e.id}
                            className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground"
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            <span className="italic">{e.banterDescription || "Banter"}</span>
                          </li>
                        ) : (
                          <li key={e.id} className="flex gap-2 py-0.5 text-sm">
                            <span className="w-5 shrink-0 text-right text-muted-foreground">
                              {++songNo}.
                            </span>
                            <span className="min-w-0">
                              <span className="font-medium">{e.title ?? "Untitled"}</span>
                              {e.artist && (
                                <span className="text-muted-foreground"> — {e.artist}</span>
                              )}
                            </span>
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
