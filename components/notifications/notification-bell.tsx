import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NotificationMenu, type NotificationVM } from "./notification-menu";

/** Header bell with unread count (§17.3). Server-rendered; updates on nav. */
export async function NotificationBell() {
  const session = await getSession();
  if (!session) return null;

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { userId: session.id, readAt: null } }),
  ]);

  const vms: NotificationVM[] = items.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    linkPath: n.linkPath,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationMenu unread={unread} items={vms} />;
}
