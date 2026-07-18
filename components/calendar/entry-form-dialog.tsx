"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  createCalendarEntry,
  updateCalendarEntry,
} from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { CalendarKind } from "@prisma/client";

type EventType = { id: string; name: string };

export type EntryInitial = {
  entryId: string;
  kind: CalendarKind;
  eventTypeId: string | null;
  title: string;
  startsAt: string;
  addDownbeat: boolean;
  loadInAt: string;
  soundcheckAt: string;
  loadOutAt: string;
  locationName: string;
  locationAddress: string;
  locationUrl: string;
  notes: string;
};

export function EntryFormDialog({
  actId,
  slug,
  eventTypes,
  initial,
  trigger,
}: {
  actId?: string;
  slug: string;
  eventTypes: EventType[];
  initial?: EntryInitial;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [kind, setKind] = React.useState<CalendarKind>(initial?.kind ?? "REHEARSAL");
  const [eventTypeId, setEventTypeId] = React.useState<string>(
    initial?.eventTypeId ?? "",
  );
  const [addDownbeat, setAddDownbeat] = React.useState(initial?.addDownbeat ?? false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      kind,
      eventTypeId: kind === "EVENT" ? eventTypeId || null : null,
      title: String(f.get("title") ?? ""),
      startsAt: String(f.get("startsAt") ?? ""),
      addDownbeat,
      loadInAt: String(f.get("loadInAt") ?? "") || undefined,
      soundcheckAt: String(f.get("soundcheckAt") ?? "") || undefined,
      loadOutAt: String(f.get("loadOutAt") ?? "") || undefined,
      locationName: String(f.get("locationName") ?? "") || undefined,
      locationAddress: String(f.get("locationAddress") ?? "") || undefined,
      locationUrl: String(f.get("locationUrl") ?? "") || undefined,
      notes: String(f.get("notes") ?? "") || undefined,
    };

    setPending(true);
    const res = initial
      ? await updateCalendarEntry({ entryId: initial.entryId, ...payload })
      : await createCalendarEntry({ actId: actId!, ...payload });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: initial ? "Entry updated" : "Entry created" });
    setOpen(false);
    if (!initial && "data" in res && res.data?.id) {
      router.push(`/acts/${slug}/calendar/${res.data.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> New entry
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit entry" : "New calendar entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CalendarKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REHEARSAL">Rehearsal</SelectItem>
                  <SelectItem value="EVENT">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "EVENT" && (
              <div className="space-y-2">
                <Label>Event type</Label>
                <Select value={eventTypeId} onValueChange={setEventTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={initial?.title} required maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="startsAt">Date &amp; start time</Label>
            <Input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={initial?.startsAt}
              required
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={addDownbeat}
                onCheckedChange={(v) => setAddDownbeat(Boolean(v))}
              />
              Add downbeat to the schedule (same as start time)
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loadInAt">Load-in</Label>
              <Input id="loadInAt" name="loadInAt" type="datetime-local" defaultValue={initial?.loadInAt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="soundcheckAt">Soundcheck</Label>
              <Input id="soundcheckAt" name="soundcheckAt" type="datetime-local" defaultValue={initial?.soundcheckAt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loadOutAt">Load-out</Label>
              <Input id="loadOutAt" name="loadOutAt" type="datetime-local" defaultValue={initial?.loadOutAt} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locationName">Location</Label>
            <Input id="locationName" name="locationName" placeholder="Venue name" defaultValue={initial?.locationName} />
            <Input name="locationAddress" placeholder="Address" defaultValue={initial?.locationAddress} />
            <Input name="locationUrl" placeholder="Map or website URL" defaultValue={initial?.locationUrl} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (markdown)</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : initial ? "Save changes" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
