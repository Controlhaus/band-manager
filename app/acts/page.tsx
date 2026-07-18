import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getUserActs } from "@/lib/act-access";
import { UserMenu } from "@/components/app-shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ActsPage() {
  const user = await requireSession();
  const acts = await getUserActs(user);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <h1 className="text-lg font-semibold">Band Manager</h1>
        <div className="flex items-center gap-3">
          {user.globalRole === "SUPERADMIN" && (
            <Link
              href="/admin"
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Admin
            </Link>
          )}
          <NotificationBell />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl p-4 md:p-8">
        <h2 className="mb-4 text-xl font-semibold">Your acts</h2>
        {acts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You&apos;re not a member of any acts yet.
            {user.globalRole === "SUPERADMIN"
              ? " Create one from the admin area."
              : " Ask an admin to invite you."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {acts.map((a) => (
              <Link key={a.id} href={`/acts/${a.slug}`}>
                <Card className="h-full transition-colors hover:bg-accent">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="truncate">{a.name}</CardTitle>
                      <Badge variant="secondary">{a.role}</Badge>
                    </div>
                    {a.description && (
                      <CardDescription className="line-clamp-2">
                        {a.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
