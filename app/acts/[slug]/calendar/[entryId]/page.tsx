import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { formatInAct, toLocalInputValue } from "@/lib/tz";
import { getActEventTypes } from "@/lib/event-types";
import { INLINE_PREVIEW_MIME } from "@/lib/files";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AttendanceControl,
  StatusChip,
} from "@/components/calendar/attendance-control";
import { EntryActions } from "@/components/calendar/entry-actions";
import { EntryNotes } from "@/components/calendar/entry-notes";
import { AcknowledgeCard } from "@/components/calendar/acknowledge-card";
import { CancelEntryButton } from "@/components/calendar/cancel-entry-button";
import { FileUpload } from "@/components/files/file-upload";
import { FileList, type FileItem } from "@/components/files/file-list";
import {
  SetlistEditor,
  type SetlistVM,
  type SongMeta,
} from "@/components/calendar/setlist-editor";
import type { EntryInitial } from "@/components/calendar/entry-form-dialog";

export const dynamic = "force-dynamic";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatChangeValue(v: string | null, tz: string): string {
  if (v === null || v === "") return "—";
  if (ISO_RE.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return formatInAct(d, tz, "d MMM yyyy HH:mm");
  }
  return v;
}

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ slug: string; entryId: string }>;
}) {
  const { slug, entryId } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const entry = await prisma.calendarEntry.findFirst({
    where: { id: entryId, actId: act.id },
    include: {
      eventType: true,
      setlists: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { song: { select: { id: true, title: true, artist: true } } },
          },
        },
      },
      attendances: { include: { user: { select: { id: true, name: true } } } },
      acknowledgements: true,
      changeLogs: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
      bookingGroup: { select: { id: true, title: true } },
    },
  });
  if (!entry) notFound();

  const tz = act.timezone;
  const canWrite = can(act.role, "calendar:write");
  const canManage = can(act.role, "act:manageMembers");
  const canManageBooking = can(act.role, "booking:manage");

  const [members, statuses, catalog, files, eventTypes] = await Promise.all([
    prisma.actMembership.findMany({
      where: { actId: act.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.attendanceStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.song.findMany({
      where: { actId: act.id, status: { not: "RETIRED" } },
      select: { id: true, title: true, artist: true },
      orderBy: { title: "asc" },
    }),
    prisma.fileAsset.findMany({
      where: { entityType: "CALENDAR_ENTRY", entityId: entry.id },
      orderBy: { createdAt: "asc" },
    }),
    getActEventTypes(act.id),
  ]);

  // Song metadata for the side sheet (lyrics + first previewable lead sheet).
  const songIds = Array.from(
    new Set(entry.setlists.flatMap((s) => s.items.map((i) => i.songId))),
  );
  const songMeta: Record<string, SongMeta> = {};
  if (songIds.length) {
    const [songs, leadSheets] = await Promise.all([
      prisma.song.findMany({
        where: { id: { in: songIds } },
        select: { id: true, lyrics: true },
      }),
      prisma.fileAsset.findMany({
        where: {
          entityType: "SONG",
          entityId: { in: songIds },
          kind: "LEAD_SHEET",
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const sheetBySong = new Map<string, { id: string; mimeType: string }>();
    for (const f of leadSheets) {
      if (!sheetBySong.has(f.entityId) && INLINE_PREVIEW_MIME.has(f.mimeType)) {
        sheetBySong.set(f.entityId, { id: f.id, mimeType: f.mimeType });
      }
    }
    for (const s of songs) {
      songMeta[s.id] = {
        lyrics: s.lyrics ?? null,
        leadSheet: sheetBySong.get(s.id) ?? null,
      };
    }
  }

  const attendanceByUser = new Map(entry.attendances.map((a) => [a.userId, a.statusKey]));
  const myStatusKey = attendanceByUser.get(user.id) ?? null;
  const statusByKey = new Map(statuses.map((s) => [s.key, s]));

  // Admin summary counts.
  const summary = statuses.map((s) => ({
    ...s,
    count: entry.attendances.filter((a) => a.statusKey === s.key).length,
  }));

  // Acknowledgements (§17.2).
  const ackByUser = new Map(entry.acknowledgements.map((a) => [a.userId, a]));
  const isConfirmed = entry.status === "CONFIRMED";
  const confirmedCount = members.filter((m) => {
    const a = ackByUser.get(m.userId);
    return a && a.versionAtAck === entry.version;
  }).length;
  const pendingNames = members
    .filter((m) => {
      const a = ackByUser.get(m.userId);
      return !a || a.versionAtAck < entry.version;
    })
    .map((m) => m.user.name);
  const myAck = ackByUser.get(user.id);
  const needsAck = isConfirmed && (!myAck || myAck.versionAtAck < entry.version);
  const iAmStale = Boolean(isConfirmed && myAck && myAck.versionAtAck < entry.version);

  const setlistVMs: SetlistVM[] = entry.setlists.map((sl) => ({
    id: sl.id,
    name: sl.name,
    items: sl.items.map((it) => ({
      id: it.id,
      songId: it.songId,
      songVersionId: it.songVersionId,
      notes: it.notes,
      title: it.song.title,
      artist: it.song.artist,
    })),
  }));

  const initial: EntryInitial = {
    entryId: entry.id,
    kind: entry.kind,
    eventTypeId: entry.eventTypeId,
    title: entry.title,
    startsAt: toLocalInputValue(entry.startsAt, tz),
    addDownbeat: entry.downbeatAt !== null,
    loadInAt: entry.loadInAt ? toLocalInputValue(entry.loadInAt, tz) : "",
    soundcheckAt: entry.soundcheckAt ? toLocalInputValue(entry.soundcheckAt, tz) : "",
    loadOutAt: entry.loadOutAt ? toLocalInputValue(entry.loadOutAt, tz) : "",
    locationName: entry.locationName ?? "",
    locationAddress: entry.locationAddress ?? "",
    locationUrl: entry.locationUrl ?? "",
    notes: entry.notes ?? "",
  };

  const schedule: Array<[string, Date | null]> = [
    ["Load-in", entry.loadInAt],
    ["Soundcheck", entry.soundcheckAt],
    ["Downbeat", entry.downbeatAt],
    ["Start", entry.downbeatAt ? null : entry.startsAt],
    ["Load-out", entry.loadOutAt],
  ];

  const mapHref = entry.locationUrl
    ? entry.locationUrl
    : entry.locationAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.locationAddress)}`
      : null;

  const fileItems: FileItem[] = files.map((f) => ({
    id: f.id,
    filename: f.filename,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={entry.kind === "EVENT" ? "default" : "secondary"}>
              {entry.kind === "EVENT" ? "Event" : "Rehearsal"}
            </Badge>
            {entry.eventType && <Badge variant="outline">{entry.eventType.name}</Badge>}
            {entry.status === "TENTATIVE" && <Badge variant="outline">Tentative</Badge>}
            {entry.status === "CANCELLED" && <Badge variant="destructive">Cancelled</Badge>}
            {isConfirmed && (
              <Badge variant="outline">
                Confirmed {confirmedCount}/{members.length}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{entry.title}</h1>
          <p className="text-muted-foreground">
            {formatInAct(entry.startsAt, tz, "EEEE d MMMM yyyy")} · {tz}
          </p>
          {isConfirmed && pendingNames.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Pending: {pendingNames.join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <EntryActions
              slug={slug}
              entryId={entry.id}
              eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))}
              initial={initial}
            />
          )}
          {canManageBooking && isConfirmed && <CancelEntryButton entryId={entry.id} />}
        </div>
      </div>

      {entry.status === "TENTATIVE" && entry.bookingGroup && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="text-sm">
              This is a candidate date for the booking{" "}
              <span className="font-medium">{entry.bookingGroup.title}</span>. Respond
              with your availability on the booking page.
            </p>
            <Link
              href={`/acts/${slug}/bookings/${entry.bookingGroup.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open booking →
            </Link>
          </CardContent>
        </Card>
      )}

      {needsAck && (
        <AcknowledgeCard
          entryId={entry.id}
          stale={iAmStale}
          statuses={statuses.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {schedule
              .filter(([, d]) => d != null)
              .map(([label, d]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{formatInAct(d as Date, tz, "HH:mm")}</span>
                </div>
              ))}
            {(entry.locationName || mapHref) && (
              <div className="border-t pt-2">
                <p className="font-medium">{entry.locationName}</p>
                {entry.locationAddress && (
                  <p className="text-muted-foreground">{entry.locationAddress}</p>
                )}
                {mapHref && (
                  <Link
                    href={mapHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Open map
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Attendance</CardTitle>
            {canManage && (
              <div className="flex flex-wrap gap-1">
                {summary.map((s) => (
                  <StatusChip key={s.key} color={s.color} label={`${s.label}: ${s.count}`} />
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Your response</p>
              <AttendanceControl
                entryId={entry.id}
                statuses={statuses.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
                myStatusKey={myStatusKey}
                canSet={can(act.role, "attendance:setOwn")}
              />
            </div>
            <ul className="divide-y">
              {members.map((m) => {
                const key = attendanceByUser.get(m.userId) ?? null;
                const st = key ? statusByKey.get(key) : null;
                const a = ackByUser.get(m.userId);
                const stale = a && a.versionAtAck < entry.version;
                return (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{m.user.name}</span>
                    <span className="flex items-center gap-2">
                      {isConfirmed && a && (
                        <span className="text-xs text-muted-foreground">
                          {stale
                            ? "re-confirm pending"
                            : `confirmed ${formatInAct(a.acknowledgedAt, tz, "d MMM HH:mm")}`}
                        </span>
                      )}
                      <StatusChip color={st?.color} label={st?.label ?? "No response"} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      {entry.changeLogs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Change history ({entry.changeLogs.length})
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {entry.changeLogs.map((log) => (
                  <li key={log.id} className="border-l-2 border-border pl-3">
                    <p className="text-xs text-muted-foreground">
                      {formatInAct(log.changedAt, tz, "d MMM yyyy, HH:mm")} ·{" "}
                      {log.changedBy?.name ?? "Deleted user"}
                    </p>
                    <ul className="mt-0.5">
                      {(log.changes as { field: string; old: string | null; new: string | null }[]).map(
                        (c, i) => (
                          <li key={i} className="text-muted-foreground">
                            <span className="font-medium text-foreground">{c.field}</span>:{" "}
                            {formatChangeValue(c.old, tz)} → {formatChangeValue(c.new, tz)}
                          </li>
                        ),
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}

      <SetlistEditor
        entryId={entry.id}
        slug={slug}
        canWrite={canWrite}
        setlists={setlistVMs}
        catalog={catalog}
        songMeta={songMeta}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <EntryNotes
              entryId={entry.id}
              notes={entry.notes ?? ""}
              canEdit={can(act.role, "entry:addNotes")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Attachments</CardTitle>
            {can(act.role, "entry:addNotes") && (
              <FileUpload entityType="CALENDAR_ENTRY" entityId={entry.id} kind="ATTACHMENT" />
            )}
          </CardHeader>
          <CardContent>
            <FileList files={fileItems} canManage={can(act.role, "entry:addNotes")} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
