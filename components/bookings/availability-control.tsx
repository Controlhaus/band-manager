"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setAvailability } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { AvailabilityAnswer } from "@prisma/client";

const OPTIONS: { value: AvailabilityAnswer; label: string; color: string }[] = [
  { value: "AVAILABLE", label: "Available", color: "#16a34a" },
  { value: "NOT_AVAILABLE", label: "Not available", color: "#dc2626" },
  { value: "MAYBE", label: "Maybe", color: "#d97706" },
];

export function AvailabilityControl({
  entryId,
  value,
  disabled,
}: {
  entryId: string;
  value: AvailabilityAnswer | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function choose(answer: AvailabilityAnswer | null) {
    setPending(true);
    const res = await setAvailability({ entryId, answer });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending || disabled}
          onClick={() => choose(o.value)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
            value === o.value ? "border-transparent text-white" : "hover:bg-accent",
          )}
          style={value === o.value ? { backgroundColor: o.color } : undefined}
        >
          {o.label}
        </button>
      ))}
      {value && !disabled && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => choose(null)}>
          <X className="h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}
