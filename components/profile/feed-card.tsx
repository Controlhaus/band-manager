"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import {
  rotateCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/app/actions/feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

export function FeedCard({ hasToken }: { hasToken: boolean }) {
  const router = useRouter();
  const [url, setUrl] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function rotate() {
    setPending(true);
    const res = await rotateCalendarFeedToken();
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not generate", description: res.error });
      return;
    }
    setUrl(res.data?.url ?? null);
    toast({ title: hasToken ? "Feed URL regenerated" : "Feed URL generated" });
    router.refresh();
  }

  async function revoke() {
    if (!confirm("Revoke the calendar feed? Subscribed calendars will stop updating.")) return;
    setPending(true);
    const res = await revokeCalendarFeedToken();
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not revoke", description: res.error });
      return;
    }
    setUrl(null);
    toast({ title: "Feed revoked" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Subscribe to your confirmed gigs across all your acts in Google Calendar,
        Apple Calendar, or any app that supports iCal (ICS) URLs. Regenerating the
        link revokes the old one.
      </p>

      {url && (
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              toast({ title: "Copied" });
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
      )}
      {url && (
        <p className="text-xs text-muted-foreground">
          Copy this now — for your security it isn&apos;t shown again.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={rotate} disabled={pending}>
          <RefreshCw /> {hasToken ? "Regenerate URL" : "Generate feed URL"}
        </Button>
        {hasToken && (
          <Button variant="outline" onClick={revoke} disabled={pending}>
            <Trash2 /> Revoke
          </Button>
        )}
      </div>
    </div>
  );
}
