import { prisma } from "@/lib/prisma";
import { requireSuperadminSession } from "@/lib/session";
import { parseGrants } from "@/lib/invitations";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateActDialog } from "@/components/admin/create-act-dialog";
import { DeleteActButton } from "@/components/admin/delete-act-button";
import { InviteDialog } from "@/components/admin/invite-dialog";
import { UserActions } from "@/components/admin/user-actions";
import { InvitationActions } from "@/components/admin/invitation-actions";

export default async function AdminPage() {
  const me = await requireSuperadminSession();

  const [acts, users, invitations] = await Promise.all([
    prisma.act.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true, songs: true } } },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        memberships: { include: { act: { select: { name: true, slug: true } } } },
      },
    }),
    prisma.invitation.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const actOptions = acts.map((a) => ({ id: a.id, name: a.name }));
  const now = new Date();

  return (
    <Tabs defaultValue="acts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="acts">Acts ({acts.length})</TabsTrigger>
        <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
        <TabsTrigger value="invitations">
          Invitations ({invitations.filter((i) => !i.acceptedAt).length})
        </TabsTrigger>
      </TabsList>

      {/* ---- Acts ---- */}
      <TabsContent value="acts">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">All acts</CardTitle>
            <CreateActDialog />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Songs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.slug}</TableCell>
                    <TableCell>{a._count.memberships}</TableCell>
                    <TableCell>{a._count.songs}</TableCell>
                    <TableCell className="text-right">
                      <DeleteActButton actId={a.id} actName={a.name} />
                    </TableCell>
                  </TableRow>
                ))}
                {acts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No acts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---- Users ---- */}
      <TabsContent value="users">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All users</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Global role</TableHead>
                  <TableHead>Acts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.globalRole === "SUPERADMIN" ? "default" : "secondary"}>
                        {u.globalRole}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.memberships.length === 0
                        ? "—"
                        : u.memberships
                            .map((m) => `${m.act.name} (${m.role})`)
                            .join(", ")}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions
                        userId={u.id}
                        isSelf={u.id === me.id}
                        globalRole={u.globalRole}
                        isActive={u.isActive}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---- Invitations ---- */}
      <TabsContent value="invitations">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Invitations</CardTitle>
            <InviteDialog acts={actOptions} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Grants</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => {
                  const grants = parseGrants(inv.grants);
                  const status = inv.acceptedAt
                    ? "Accepted"
                    : inv.expiresAt < now
                      ? "Expired"
                      : "Pending";
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {grants
                          .map((g) => {
                            const act = acts.find((a) => a.id === g.actId);
                            return act ? `${act.name} (${g.role})` : g.role;
                          })
                          .join(", ")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "Accepted"
                              ? "default"
                              : status === "Expired"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!inv.acceptedAt && (
                          <InvitationActions invitationId={inv.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {invitations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No invitations yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
