"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { cancelCalendarEntry } from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function CancelEntryButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function cancel() {
    if (!confirm("Cancel this gig? Members will be notified.")) return;
    setPending(true);
    const res = await cancelCalendarEntry({ entryId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not cancel", description: res.error });
      return;
    }
    toast({ title: "Gig cancelled" });
    router.refresh();
  }
  return (
    <Button variant="destructive" size="sm" onClick={cancel} disabled={pending}>
      <Ban /> Cancel gig
    </Button>
  );
}
