"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Trash2 } from "lucide-react";
import {
  cancelBookingGroup,
  confirmBookingDate,
  nudgeBooking,
} from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export function NudgeButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function nudge() {
    setPending(true);
    const res = await nudgeBooking({ groupId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not nudge", description: res.error });
      return;
    }
    toast({ title: "Reminder sent to non-responders" });
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={nudge} disabled={pending}>
      <Bell /> Nudge
    </Button>
  );
}

export function CancelBookingButton({ groupId, slug }: { groupId: string; slug: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function cancel() {
    if (!confirm("Cancel this booking? All candidate dates will be cancelled and members notified.")) return;
    setPending(true);
    const res = await cancelBookingGroup({ groupId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not cancel", description: res.error });
      return;
    }
    toast({ title: "Booking cancelled" });
    router.push(`/acts/${slug}/bookings`);
  }
  return (
    <Button variant="destructive" size="sm" onClick={cancel} disabled={pending}>
      <Trash2 /> Cancel booking
    </Button>
  );
}

export function ConfirmDateButton({
  groupId,
  entryId,
  title,
  slug,
}: {
  groupId: string;
  entryId: string;
  title: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirmTitle, setConfirmTitle] = React.useState("");

  async function confirm() {
    setPending(true);
    const res = await confirmBookingDate({ groupId, entryId, confirmTitle });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not confirm", description: res.error });
      return;
    }
    toast({ title: "Date confirmed", description: "Attendance seeded and members notified." });
    setOpen(false);
    router.push(`/acts/${slug}/calendar/${entryId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Check /> Confirm this date
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm this date</DialogTitle>
          <DialogDescription>
            This cancels the other options and binds attendance from the poll.
            Type the option title <span className="font-medium">{title}</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-title">Option title</Label>
          <Input
            id="confirm-title"
            value={confirmTitle}
            onChange={(e) => setConfirmTitle(e.target.value)}
            placeholder={title}
          />
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={pending || confirmTitle !== title}>
            {pending ? "Confirming…" : "Confirm date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
