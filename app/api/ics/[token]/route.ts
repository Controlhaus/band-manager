import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/invitations";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { formatInAct } from "@/lib/tz";

/**
 * Public ICS feed (§17.4). The token is the auth — no session. Returns all
 * CONFIRMED, non-cancelled entries across the token owner's acts. Regenerating
 * the token (new hash) makes old URLs 404.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const record = await prisma.calendarFeedToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: { userId: true },
  });
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const memberships = await prisma.actMembership.findMany({
    where: { userId: record.userId },
    select: { actId: true },
  });
  const actIds = memberships.map((m) => m.actId);

  const entries = actIds.length
    ? await prisma.calendarEntry.findMany({
        where: { actId: { in: actIds }, status: "CONFIRMED" },
        include: { act: { select: { name: true, timezone: true } } },
        orderBy: { startsAt: "asc" },
      })
    : [];

  const events: IcsEvent[] = entries.map((e) => {
    const end = e.loadOutAt ?? new Date(e.startsAt.getTime() + 3 * 60 * 60 * 1000);
    const tz = e.act.timezone;
    const times = [
      e.loadInAt ? `Load-in ${formatInAct(e.loadInAt, tz, "HH:mm")}` : null,
      e.soundcheckAt ? `Soundcheck ${formatInAct(e.soundcheckAt, tz, "HH:mm")}` : null,
      e.downbeatAt ? `Downbeat ${formatInAct(e.downbeatAt, tz, "HH:mm")}` : null,
      e.loadOutAt ? `Load-out ${formatInAct(e.loadOutAt, tz, "HH:mm")}` : null,
    ].filter(Boolean);
    const location = [e.locationName, e.locationAddress].filter(Boolean).join(", ") || null;
    return {
      uid: e.id,
      version: e.version,
      startsAt: e.startsAt,
      endsAt: end,
      summary: `[${e.act.name}] ${e.title}`,
      location,
      description: times.length ? times.join(" · ") : e.notes ?? null,
    };
  });

  return new NextResponse(buildIcs(events), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="band-manager.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
