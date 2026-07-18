import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MemberRow } from "@/components/members/member-row";
import { ActInviteDialog } from "@/components/members/act-invite-dialog";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const manage = can(act.role, "act:manageMembers");

  const memberships = await prisma.actMembership.findMany({
    where: { actId: act.id },
    include: { user: { include: { profile: true } } },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">
            {memberships.length} member{memberships.length === 1 ? "" : "s"}
          </p>
        </div>
        {manage && <ActInviteDialog actId={act.id} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roster</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {memberships.map((m) => (
            <MemberRow
              key={m.id}
              actId={act.id}
              userId={m.userId}
              name={m.user.name}
              email={m.user.email}
              role={m.role}
              canManage={manage && m.userId !== user.id}
              instruments={m.user.profile?.instruments ?? []}
              skillLevel={m.user.profile?.skillLevel ?? null}
              bio={m.user.profile?.bio ?? null}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export const dynamic = "force-dynamic";
