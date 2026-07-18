"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { deleteCalendarEntry, duplicateEntry } from "@/app/actions/calendar";
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
import {
  EntryFormDialog,
  type EntryInitial,
} from "@/components/calendar/entry-form-dialog";
import { toast } from "@/hooks/use-toast";

export function EntryActions({
  slug,
  entryId,
  eventTypes,
  initial,
}: {
  slug: string;
  entryId: string;
  eventTypes: { id: string; name: string }[];
  initial: EntryInitial;
}) {
  const router = useRouter();
  const [dupOpen, setDupOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onDelete() {
    if (!confirm("Delete this entry? This removes its setlists and attendance.")) return;
    const res = await deleteCalendarEntry({ entryId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Entry deleted" });
    router.push(`/acts/${slug}/calendar`);
  }

  async function onDuplicate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const startsAt = String(new FormData(e.currentTarget).get("startsAt") ?? "");
    setPending(true);
    const res = await duplicateEntry({ entryId, startsAt });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not duplicate", description: res.error });
      return;
    }
    toast({ title: "Entry duplicated" });
    setDupOpen(false);
    if (res.data?.id) router.push(`/acts/${slug}/calendar/${res.data.id}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntryFormDialog
        slug={slug}
        eventTypes={eventTypes}
        initial={initial}
        trigger={
          <Button variant="outline" size="sm">
            <Pencil /> Edit
          </Button>
        }
      />

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Copy /> Duplicate
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={onDuplicate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dup-start">New date &amp; time</Label>
              <Input id="dup-start" name="startsAt" type="datetime-local" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Duplicating…" : "Duplicate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Button variant="destructive" size="sm" onClick={onDelete}>
        <Trash2 /> Delete
      </Button>
    </div>
  );
}
