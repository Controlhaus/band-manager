import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { isSuperadmin } from "@/lib/permissions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MemberRow } from "@/components/members/member-row";
import { ActInviteDialog } from "@/components/members/act-invite-dialog";
import {
  AddMemberDialog,
  type MemberCandidate,
} from "@/components/members/add-member-dialog";

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

  // Users addable without an invite: active users visible to the caller
  // (members of acts they administer; superadmins see everyone) who aren't
  // already in this act. Scoping prevents user enumeration.
  let candidates: MemberCandidate[] = [];
  if (manage) {
    const memberIds = memberships.map((m) => m.userId);
    const visibility = isSuperadmin(user)
      ? {}
      : {
          memberships: {
            some: {
              act: {
                memberships: { some: { userId: user.id, role: "ADMIN" as const } },
              },
            },
          },
        };
    candidates = await prisma.user.findMany({
      where: { isActive: true, id: { notIn: memberIds }, ...visibility },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">
            {memberships.length} member{memberships.length === 1 ? "" : "s"}
          </p>
        </div>
        {manage && (
          <div className="flex items-center gap-2">
            {candidates.length > 0 && (
              <AddMemberDialog actId={act.id} candidates={candidates} />
            )}
            <ActInviteDialog actId={act.id} />
          </div>
        )}
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
