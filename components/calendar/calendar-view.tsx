"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarKind, EntryStatus } from "@prisma/client";

export type CalendarEntryVM = {
  id: string;
  title: string;
  kind: CalendarKind;
  status: EntryStatus;
  optionLabel: string | null;
  eventTypeName: string | null;
  startsAtIso: string;
  day: string; // YYYY-MM-DD in act tz
  timeLabel: string;
  dateLabel: string;
};

const VIEW_KEY = "bandmanager.calendarView";

export function CalendarView({
  slug,
  entries,
  timezone,
}: {
  slug: string;
  entries: CalendarEntryVM[];
  timezone: string;
}) {
  const [view, setView] = React.useState<"list" | "month">("list");
  const [monthOffset, setMonthOffset] = React.useState(0);
  const [showCancelled, setShowCancelled] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    // Default to list on small screens (§14.12).
    if (stored === "month" || stored === "list") setView(stored);
    else if (window.matchMedia("(min-width: 768px)").matches) setView("month");
  }, []);

  function choose(v: "list" | "month") {
    setView(v);
    window.localStorage.setItem(VIEW_KEY, v);
  }

  const visible = entries.filter(
    (e) => showCancelled || e.status !== "CANCELLED",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => choose("list")}
          >
            <List /> List
          </Button>
          <Button
            variant={view === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => choose("month")}
          >
            <CalendarDays /> Month
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={showCancelled}
            onCheckedChange={(v) => setShowCancelled(Boolean(v))}
          />
          Show cancelled
        </label>
      </div>

      {view === "list" ? (
        <ListView slug={slug} entries={visible} />
      ) : (
        <MonthView
          slug={slug}
          entries={visible}
          timezone={timezone}
          monthOffset={monthOffset}
          onMonth={setMonthOffset}
        />
      )}
    </div>
  );
}

function EntryPill({ slug, e }: { slug: string; e: CalendarEntryVM }) {
  const tentative = e.status === "TENTATIVE";
  const cancelled = e.status === "CANCELLED";
  return (
    <Link
      href={`/acts/${slug}/calendar/${e.id}`}
      className={cn(
        "block truncate rounded px-1.5 py-0.5 text-xs hover:opacity-80",
        cancelled && "text-muted-foreground line-through",
        tentative && "border border-dashed border-primary bg-transparent text-foreground",
        !tentative && !cancelled && e.kind === "EVENT" && "bg-primary text-primary-foreground",
        !tentative && !cancelled && e.kind === "REHEARSAL" && "bg-secondary text-secondary-foreground",
      )}
      title={e.optionLabel ?? undefined}
    >
      {e.timeLabel} {e.title}
    </Link>
  );
}

function ListView({
  slug,
  entries,
}: {
  slug: string;
  entries: CalendarEntryVM[];
}) {
  const now = Date.now();
  const upcoming = entries.filter((e) => new Date(e.startsAtIso).getTime() >= now);
  const past = entries
    .filter((e) => new Date(e.startsAtIso).getTime() < now)
    .reverse();

  function Row({ e }: { e: CalendarEntryVM }) {
    return (
      <Link
        href={`/acts/${slug}/calendar/${e.id}`}
        className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent"
      >
        <div className="min-w-0">
          <p className={cn("truncate font-medium", e.status === "CANCELLED" && "line-through text-muted-foreground")}>
            {e.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {e.dateLabel} · {e.timeLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {e.optionLabel && <Badge variant="outline">{e.optionLabel}</Badge>}
          {e.status === "TENTATIVE" && <Badge variant="outline">Tentative</Badge>}
          {e.status === "CANCELLED" && <Badge variant="destructive">Cancelled</Badge>}
          {e.eventTypeName && <Badge variant="outline">{e.eventTypeName}</Badge>}
          <Badge variant={e.kind === "EVENT" ? "default" : "secondary"}>
            {e.kind === "EVENT" ? "Event" : "Rehearsal"}
          </Badge>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming entries.</p>
        ) : (
          upcoming.map((e) => <Row key={e.id} e={e} />)
        )}
      </div>
      {past.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Past</h2>
          {past.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonthView({
  slug,
  entries,
  monthOffset,
  onMonth,
}: {
  slug: string;
  entries: CalendarEntryVM[];
  timezone: string;
  monthOffset: number;
  onMonth: (n: number) => void;
}) {
  const base = new Date();
  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const monthLabel = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<string, CalendarEntryVM[]>();
  for (const e of entries) {
    const arr = byDay.get(e.day) ?? [];
    arr.push(e);
    byDay.set(e.day, arr);
  }

  const cells: Array<{ dayNum: number; key: string } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dayNum: d, key });
  }

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onMonth(monthOffset - 1)}>
            Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMonth(0)}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMonth(monthOffset + 1)}>
            Next
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-sm">
        {weekdays.map((w) => (
          <div key={w} className="bg-muted p-2 text-center text-xs font-medium">
            {w}
          </div>
        ))}
        {cells.map((cell, i) => (
          <div key={i} className="min-h-24 bg-background p-1">
            {cell && (
              <>
                <div className="mb-1 text-xs text-muted-foreground">{cell.dayNum}</div>
                <div className="space-y-1">
                  {(byDay.get(cell.key) ?? []).map((e) => (
                    <EntryPill key={e.id} slug={slug} e={e} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
