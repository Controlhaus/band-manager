"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { acknowledgeEntry } from "@/app/actions/calendar";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type StatusVM = { key: string; label: string; color: string };

export function AcknowledgeCard({
  entryId,
  statuses,
  stale,
}: {
  entryId: string;
  statuses: StatusVM[];
  stale: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function ack(statusKey: string) {
    setPending(true);
    const res = await acknowledgeEntry({ entryId, statusKey });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not confirm", description: res.error });
      return;
    }
    toast({ title: "Attendance confirmed" });
    router.refresh();
  }

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-medium">
            {stale ? "This gig changed since you confirmed" : "Confirm your attendance"}
          </p>
          <p className="text-sm text-muted-foreground">
            {stale
              ? "Please re-confirm whether you can still play."
              : "Let the act know whether you can play this confirmed date."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={pending}
              onClick={() => ack(s.key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm text-white transition-colors disabled:opacity-50",
              )}
              style={{ backgroundColor: s.color }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
