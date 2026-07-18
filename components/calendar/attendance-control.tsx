"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setAttendance } from "@/app/actions/calendar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export type AttendanceStatusVM = {
  key: string;
  label: string;
  color: string;
};

export function AttendanceControl({
  entryId,
  statuses,
  myStatusKey,
  canSet,
}: {
  entryId: string;
  statuses: AttendanceStatusVM[];
  myStatusKey: string | null;
  canSet: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function choose(statusKey: string | null) {
    setPending(true);
    const res = await setAttendance({ entryId, statusKey });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update", description: res.error });
      return;
    }
    router.refresh();
  }

  if (!canSet) {
    const current = statuses.find((s) => s.key === myStatusKey);
    return (
      <StatusChip
        color={current?.color}
        label={current?.label ?? "No response"}
      />
    );
  }

  // ≤3 statuses → segmented control; 4+ → dropdown (§14.9).
  if (statuses.length <= 3) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {statuses.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={pending}
            onClick={() => choose(s.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              myStatusKey === s.key
                ? "border-transparent text-white"
                : "hover:bg-accent",
            )}
            style={myStatusKey === s.key ? { backgroundColor: s.color } : undefined}
          >
            {s.label}
          </button>
        ))}
        {myStatusKey && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => choose(null)}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={myStatusKey ?? ""}
        onValueChange={(v) => choose(v)}
        disabled={pending}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="No response" />
        </SelectTrigger>
        <SelectContent>
          {statuses.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {myStatusKey && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => choose(null)}>
          <X className="h-4 w-4" /> Clear
        </Button>
      )}
    </div>
  );
}

export function StatusChip({
  color,
  label,
}: {
  color?: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={color ? { borderColor: color, color } : undefined}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  );
}
