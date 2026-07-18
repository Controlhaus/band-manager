import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Music, Users } from "lucide-react";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { formatInAct } from "@/lib/tz";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ActDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const [upcoming, recentSongs, memberCount, songCount, confirmedUpcoming] =
    await Promise.all([
      prisma.calendarEntry.findMany({
        where: {
          actId: act.id,
          startsAt: { gte: new Date() },
          status: { not: "CANCELLED" },
        },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prisma.song.findMany({
        where: { actId: act.id },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.actMembership.count({ where: { actId: act.id } }),
      prisma.song.count({ where: { actId: act.id } }),
      prisma.calendarEntry.findMany({
        where: {
          actId: act.id,
          status: "CONFIRMED",
          startsAt: { gte: new Date() },
        },
        include: { acknowledgements: { where: { userId: user.id } } },
        orderBy: { startsAt: "asc" },
      }),
    ]);

  // Confirmed gigs the current user still needs to acknowledge (§17.2).
  const needsAck = confirmedUpcoming.filter((e) => {
    const a = e.acknowledgements[0];
    return !a || a.versionAtAck < e.version;
  });

  const base = `/acts/${act.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{act.name}</h1>
        {act.description && (
          <p className="mt-1 text-muted-foreground">{act.description}</p>
        )}
      </div>

      {needsAck.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Confirm your attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {needsAck.map((e) => (
              <Link
                key={e.id}
                href={`${base}/calendar/${e.id}`}
                className="flex items-center justify-between rounded-md border bg-background p-2 text-sm hover:bg-accent"
              >
                <span className="truncate font-medium">{e.title}</span>
                <span className="text-muted-foreground">
                  {formatInAct(e.startsAt, act.timezone, "EEE d MMM, HH:mm")}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard href={`${base}/songs`} icon={<Music className="h-5 w-5" />} label="Songs" value={songCount} />
        <StatCard href={`${base}/calendar`} icon={<CalendarDays className="h-5 w-5" />} label="Upcoming" value={upcoming.length} />
        <StatCard href={`${base}/members`} icon={<Users className="h-5 w-5" />} label="Members" value={memberCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            ) : (
              upcoming.map((e) => (
                <Link
                  key={e.id}
                  href={`${base}/calendar/${e.id}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span className="truncate">{e.title}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant={e.kind === "EVENT" ? "default" : "secondary"}>
                      {e.kind === "EVENT" ? "Event" : "Rehearsal"}
                    </Badge>
                    {formatInAct(e.startsAt, act.timezone, "EEE d MMM, HH:mm")}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently updated songs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSongs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No songs yet.</p>
            ) : (
              recentSongs.map((s) => (
                <Link
                  key={s.id}
                  href={`${base}/songs/${s.id}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span className="truncate">{s.title}</span>
                  <Badge variant="outline">{s.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-muted p-2">{icon}</div>
          <div>
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
