import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { formatInAct } from "@/lib/tz";
import { getActEventTypes } from "@/lib/event-types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const [groups, eventTypes] = await Promise.all([
    prisma.bookingGroup.findMany({
      where: { actId: act.id },
      include: {
        candidates: { select: { id: true, startsAt: true, status: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    getActEventTypes(act.id),
  ]);

  const canManage = can(act.role, "booking:manage");
  const open = groups.filter((g) => g.status === "OPEN");
  const resolved = groups.filter((g) => g.status !== "OPEN");

  function Row({ g }: { g: (typeof groups)[number] }) {
    const dates = g.candidates
      .map((c) => formatInAct(c.startsAt, act!.timezone, "d MMM"))
      .join(", ");
    return (
      <Link
        href={`/acts/${slug}/bookings/${g.id}`}
        className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{g.title}</p>
          <p className="text-sm text-muted-foreground">
            {g._count.candidates} option{g._count.candidates === 1 ? "" : "s"}: {dates}
            {g.responseDeadline &&
              ` · responds by ${formatInAct(g.responseDeadline, act!.timezone, "d MMM HH:mm")}`}
          </p>
        </div>
        <Badge
          variant={
            g.status === "OPEN" ? "secondary" : g.status === "CONFIRMED" ? "default" : "destructive"
          }
        >
          {g.status}
        </Badge>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">
            Propose candidate dates, poll availability, and confirm.
          </p>
        </div>
        {canManage && (
          <NewBookingDialog
            actId={act.id}
            slug={slug}
            eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open ({open.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open bookings.</p>
          ) : (
            open.map((g) => <Row key={g.id} g={g} />)
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resolved.map((g) => (
              <Row key={g.id} g={g} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
