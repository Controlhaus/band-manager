import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { formatInAct } from "@/lib/tz";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AvailabilityControl } from "@/components/bookings/availability-control";
import {
  CancelBookingButton,
  ConfirmDateButton,
  NudgeButton,
} from "@/components/bookings/booking-actions";
import type { AvailabilityAnswer } from "@prisma/client";

export const dynamic = "force-dynamic";

const ANSWER_META: Record<AvailabilityAnswer, { label: string; color: string }> = {
  AVAILABLE: { label: "Available", color: "#16a34a" },
  NOT_AVAILABLE: { label: "Not available", color: "#dc2626" },
  MAYBE: { label: "Maybe", color: "#d97706" },
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ slug: string; groupId: string }>;
}) {
  const { slug, groupId } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const group = await prisma.bookingGroup.findFirst({
    where: { id: groupId, actId: act.id },
    include: {
      candidates: { orderBy: { startsAt: "asc" } },
      confirmedEntry: { select: { id: true } },
    },
  });
  if (!group) notFound();

  const [members, responses] = await Promise.all([
    prisma.actMembership.findMany({
      where: { actId: act.id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.availabilityResponse.findMany({
      where: { entryId: { in: group.candidates.map((c) => c.id) } },
    }),
  ]);

  const tz = act.timezone;
  const canManage = can(act.role, "booking:manage");
  const canRespond = can(act.role, "booking:respond");
  const isOpen = group.status === "OPEN";

  // responses keyed by `${entryId}:${userId}`
  const respMap = new Map<string, (typeof responses)[number]>();
  for (const r of responses) respMap.set(`${r.entryId}:${r.userId}`, r);

  const myAnswer = (entryId: string): AvailabilityAnswer | null =>
    respMap.get(`${entryId}:${user.id}`)?.answer ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge
              variant={isOpen ? "secondary" : group.status === "CONFIRMED" ? "default" : "destructive"}
            >
              {group.status}
            </Badge>
            {group.responseDeadline && isOpen && (
              <span className="text-sm text-muted-foreground">
                Respond by {formatInAct(group.responseDeadline, tz, "EEE d MMM, HH:mm")}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{group.title}</h1>
          {(group.customerName || group.customerContact) && (
            <p className="text-muted-foreground">
              {group.customerName}
              {group.customerContact ? ` · ${group.customerContact}` : ""}
            </p>
          )}
          {group.venueNotes && <p className="mt-1 text-sm">{group.venueNotes}</p>}
        </div>
        {canManage && isOpen && (
          <div className="flex flex-wrap gap-2">
            <NudgeButton groupId={group.id} />
            <CancelBookingButton groupId={group.id} slug={slug} />
          </div>
        )}
      </div>

      {group.status === "CONFIRMED" && group.confirmedEntry && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <p className="text-sm">This booking is confirmed.</p>
            <Link
              href={`/acts/${slug}/calendar/${group.confirmedEntry.id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Open the gig →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Your availability */}
      {canRespond && isOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your availability</CardTitle>
            <p className="text-sm text-muted-foreground">
              Available = you&apos;re committing to play if this date is chosen.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.candidates.map((c, i) => (
              <div key={c.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    Option {i + 1}/{group.candidates.length} ·{" "}
                    {formatInAct(c.startsAt, tz, "EEE d MMM yyyy, HH:mm")}
                  </p>
                  {c.locationName && (
                    <p className="text-sm text-muted-foreground">{c.locationName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <AvailabilityControl entryId={c.id} value={myAnswer(c.id)} />
                  {canManage && (
                    <ConfirmDateButton
                      groupId={group.id}
                      entryId={c.id}
                      title={c.title}
                      slug={slug}
                    />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Response matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                {group.candidates.map((c, i) => (
                  <TableHead key={c.id} className="text-center">
                    <div>Opt {i + 1}</div>
                    <div className="text-[10px] font-normal">
                      {formatInAct(c.startsAt, tz, "d MMM")}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.user.name}</TableCell>
                  {group.candidates.map((c) => {
                    const r = respMap.get(`${c.id}:${m.userId}`);
                    return (
                      <TableCell key={c.id} className="text-center">
                        {r ? (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                            style={{ backgroundColor: ANSWER_META[r.answer].color }}
                            title={`${ANSWER_META[r.answer].label} · ${formatInAct(r.respondedAt, tz, "d MMM HH:mm")}`}
                          >
                            {ANSWER_META[r.answer].label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
