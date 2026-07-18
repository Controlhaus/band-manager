import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { formatInAct, actLocalDay } from "@/lib/tz";
import { getActEventTypes } from "@/lib/event-types";
import { CalendarView, type CalendarEntryVM } from "@/components/calendar/calendar-view";
import { EntryFormDialog } from "@/components/calendar/entry-form-dialog";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const [entries, eventTypes] = await Promise.all([
    prisma.calendarEntry.findMany({
      where: { actId: act.id },
      include: { eventType: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    }),
    getActEventTypes(act.id),
  ]);

  // Option x/n index for tentative candidates within their booking group.
  const groupOrder = new Map<string, string[]>();
  for (const e of entries) {
    if (e.status === "TENTATIVE" && e.bookingGroupId) {
      const arr = groupOrder.get(e.bookingGroupId) ?? [];
      arr.push(e.id);
      groupOrder.set(e.bookingGroupId, arr);
    }
  }

  const vms: CalendarEntryVM[] = entries.map((e) => {
    let optionLabel: string | null = null;
    if (e.status === "TENTATIVE" && e.bookingGroupId) {
      const ids = groupOrder.get(e.bookingGroupId) ?? [];
      const idx = ids.indexOf(e.id);
      if (idx >= 0) optionLabel = `Option ${idx + 1}/${ids.length}`;
    }
    return {
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status,
      optionLabel,
      eventTypeName: e.eventType?.name ?? null,
      startsAtIso: e.startsAt.toISOString(),
      day: actLocalDay(e.startsAt, act.timezone),
      timeLabel: formatInAct(e.startsAt, act.timezone, "HH:mm"),
      dateLabel: formatInAct(e.startsAt, act.timezone, "EEE d MMM yyyy"),
    };
  });

  const canWrite = can(act.role, "calendar:write");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">{act.timezone}</p>
        </div>
        {canWrite && (
          <EntryFormDialog
            actId={act.id}
            slug={slug}
            eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))}
          />
        )}
      </div>

      <CalendarView slug={slug} entries={vms} timezone={act.timezone} />
    </div>
  );
}
