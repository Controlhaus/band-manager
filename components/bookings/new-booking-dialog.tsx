"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createBookingGroup } from "@/app/actions/bookings";
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

type Candidate = {
  kind: CalendarKind;
  eventTypeId: string;
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

function emptyCandidate(title: string): Candidate {
  return {
    kind: "EVENT",
    eventTypeId: "",
    title,
    startsAt: "",
    addDownbeat: false,
    loadInAt: "",
    soundcheckAt: "",
    loadOutAt: "",
    locationName: "",
    locationAddress: "",
    locationUrl: "",
    notes: "",
  };
}

export function NewBookingDialog({
  actId,
  slug,
  eventTypes,
  setLists,
}: {
  actId: string;
  slug: string;
  eventTypes: EventType[];
  setLists: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerContact, setCustomerContact] = React.useState("");
  const [venueNotes, setVenueNotes] = React.useState("");
  const [responseDeadline, setResponseDeadline] = React.useState("");
  const [setListId, setSetListId] = React.useState("");
  const [candidates, setCandidates] = React.useState<Candidate[]>([emptyCandidate("")]);

  function patch(i: number, p: Partial<Candidate>) {
    setCandidates((prev) => prev.map((c, ci) => (ci === i ? { ...c, ...p } : c)));
  }

  async function submit() {
    setPending(true);
    const res = await createBookingGroup({
      actId,
      title,
      customerName: customerName || undefined,
      customerContact: customerContact || undefined,
      venueNotes: venueNotes || undefined,
      responseDeadline: responseDeadline || undefined,
      setListId: setListId || undefined,
      candidates: candidates.map((c) => ({
        kind: c.kind,
        eventTypeId: c.kind === "EVENT" ? c.eventTypeId || null : null,
        title: c.title || title,
        startsAt: c.startsAt,
        addDownbeat: c.addDownbeat,
        loadInAt: c.loadInAt || undefined,
        soundcheckAt: c.soundcheckAt || undefined,
        loadOutAt: c.loadOutAt || undefined,
        locationName: c.locationName || undefined,
        locationAddress: c.locationAddress || undefined,
        locationUrl: c.locationUrl || undefined,
        notes: c.notes || undefined,
      })),
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not create booking", description: res.error });
      return;
    }
    toast({ title: "Booking created", description: "Members have been notified to respond." });
    setOpen(false);
    if (res.data?.id) router.push(`/acts/${slug}/bookings/${res.data.id}`);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="b-title">Booking title</Label>
            <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="b-cust">Customer</Label>
              <Input id="b-cust" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-contact">Customer contact</Label>
              <Input id="b-contact" value={customerContact} onChange={(e) => setCustomerContact(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-venue">Venue notes</Label>
            <Textarea id="b-venue" value={venueNotes} onChange={(e) => setVenueNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-deadline">Response deadline (optional)</Label>
            <Input id="b-deadline" type="datetime-local" value={responseDeadline} onChange={(e) => setResponseDeadline(e.target.value)} />
          </div>

          {setLists.length > 0 && (
            <div className="space-y-2">
              <Label>Set list (optional)</Label>
              <Select
                value={setListId || "none"}
                onValueChange={(v) => setSetListId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
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
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Candidate dates</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCandidates((c) => [...c, emptyCandidate("")])}
              >
                <Plus /> Add date
              </Button>
            </div>
            {candidates.map((c, i) => (
              <div key={i} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Option {i + 1}</span>
                  {candidates.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCandidates((prev) => prev.filter((_, ci) => ci !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Kind</Label>
                    <Select value={c.kind} onValueChange={(v) => patch(i, { kind: v as CalendarKind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EVENT">Event</SelectItem>
                        <SelectItem value="REHEARSAL">Rehearsal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {c.kind === "EVENT" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Event type</Label>
                      <Select value={c.eventTypeId} onValueChange={(v) => patch(i, { eventTypeId: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                        <SelectContent>
                          {eventTypes.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Title (optional)</Label>
                    <Input value={c.title} placeholder={title} onChange={(e) => patch(i, { title: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date &amp; start</Label>
                    <Input type="datetime-local" value={c.startsAt} onChange={(e) => patch(i, { startsAt: e.target.value })} required />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={c.addDownbeat} onCheckedChange={(v) => patch(i, { addDownbeat: Boolean(v) })} />
                  Add downbeat (same as start)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Load-in</Label>
                    <Input type="datetime-local" value={c.loadInAt} onChange={(e) => patch(i, { loadInAt: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Soundcheck</Label>
                    <Input type="datetime-local" value={c.soundcheckAt} onChange={(e) => patch(i, { soundcheckAt: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Load-out</Label>
                    <Input type="datetime-local" value={c.loadOutAt} onChange={(e) => patch(i, { loadOutAt: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location</Label>
                  <Input value={c.locationName} placeholder="Venue name" onChange={(e) => patch(i, { locationName: e.target.value })} />
                  <Input value={c.locationAddress} placeholder="Address" onChange={(e) => patch(i, { locationAddress: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !title}>
            {pending ? "Creating…" : "Create & notify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
