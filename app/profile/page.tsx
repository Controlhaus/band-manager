import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";
import { EmailForm } from "@/components/profile/email-form";
import { FeedCard } from "@/components/profile/feed-card";
import { MySongsTable } from "@/components/profile/my-songs-table";
import type { EquipmentItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireSession();

  const profile = await prisma.userProfile.findUnique({
    where: { userId: user.id },
  });

  const feedToken = await prisma.calendarFeedToken.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  // Acts the user belongs to (for "My songs" + instrument suggestions).
  const memberships = await prisma.actMembership.findMany({
    where: { userId: user.id },
    select: { actId: true },
  });
  const actIds = memberships.map((m) => m.actId);

  const [songs, statuses, peerProfiles] = await Promise.all([
    prisma.song.findMany({
      where: { actId: { in: actIds } },
      include: { act: { select: { name: true, slug: true } } },
      orderBy: [{ act: { name: "asc" } }, { title: "asc" }],
    }),
    prisma.userSongStatus.findMany({ where: { userId: user.id } }),
    prisma.userProfile.findMany({
      where: { user: { memberships: { some: { actId: { in: actIds } } } } },
      select: { instruments: true },
    }),
  ]);

  const statusBySong = new Map(statuses.map((s) => [s.songId, s]));
  const suggestions = Array.from(
    new Set(peerProfiles.flatMap((p) => p.instruments)),
  ).sort();

  const songRows = songs.map((s) => {
    const st = statusBySong.get(s.id);
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      actName: s.act.name,
      actSlug: s.act.slug,
      rehearsed: st?.rehearsed ?? false,
      performedCount: st?.performedCount ?? 0,
    };
  });

  const equipment = (profile?.equipment as EquipmentItem[] | null) ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            Your sign-in email. Changing it takes effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailForm email={user.email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendar feed</CardTitle>
          <CardDescription>Subscribe to your confirmed gigs.</CardDescription>
        </CardHeader>
        <CardContent>
          <FeedCard hasToken={Boolean(feedToken)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your profile</CardTitle>
          <CardDescription>
            Visible to fellow members of your acts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user.name}
            instruments={profile?.instruments ?? []}
            skillLevel={profile?.skillLevel ?? null}
            equipment={equipment}
            bio={profile?.bio ?? ""}
            instrumentSuggestions={suggestions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My songs</CardTitle>
          <CardDescription>
            Track what you&apos;ve rehearsed and performed across your acts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MySongsTable songs={songRows} />
        </CardContent>
      </Card>
    </div>
  );
}
