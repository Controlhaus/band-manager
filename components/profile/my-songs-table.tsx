"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { setUserSongStatus } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

type SongRow = {
  id: string;
  title: string;
  artist: string | null;
  actName: string;
  actSlug: string;
  rehearsed: boolean;
  performedCount: number;
};

export function MySongsTable({ songs }: { songs: SongRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

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

  if (songs.length === 0) {
    return <p className="text-sm text-muted-foreground">No songs in your acts yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Song</TableHead>
          <TableHead>Act</TableHead>
          <TableHead>Rehearsed</TableHead>
          <TableHead>Performed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {songs.map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              <Link
                href={`/acts/${s.actSlug}/songs/${s.id}`}
                className="font-medium hover:underline"
              >
                {s.title}
              </Link>
              {s.artist && (
                <span className="ml-1 text-muted-foreground">— {s.artist}</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{s.actName}</TableCell>
            <TableCell>
              <Switch
                checked={s.rehearsed}
                disabled={pendingId === s.id}
                onCheckedChange={(v) => update(s.id, { rehearsed: v })}
                aria-label="Rehearsed"
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pendingId === s.id || s.performedCount === 0}
                  onClick={() =>
                    update(s.id, { performedCount: Math.max(0, s.performedCount - 1) })
                  }
                  aria-label="Decrease performed count"
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center tabular-nums">{s.performedCount}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pendingId === s.id}
                  onClick={() => update(s.id, { performedCount: s.performedCount + 1 })}
                  aria-label="Increase performed count"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
