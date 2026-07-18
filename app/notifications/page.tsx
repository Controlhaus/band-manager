import Link from "next/link";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserMenu } from "@/components/app-shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NotificationList } from "@/components/notifications/notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireSession();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unread = items.filter((n) => n.readAt === null).length;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Notifications</h1>
          <Link href="/acts" className="text-sm text-muted-foreground underline underline-offset-2">
            My acts
          </Link>
        </div>
        <div className="flex items-center">
          <NotificationBell />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
        <NotificationList
          unread={unread}
          items={items.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            linkPath: n.linkPath,
            read: n.readAt !== null,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
