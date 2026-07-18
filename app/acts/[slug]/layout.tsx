import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getUserActs, loadActForUser } from "@/lib/act-access";
import { ActShell } from "@/components/app-shell/act-shell";
import { NotificationBell } from "@/components/notifications/notification-bell";

export default async function ActLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const acts = await getUserActs(user);

  return (
    <ActShell
      act={{ name: act.name, slug: act.slug, role: act.role }}
      acts={acts.map((a) => ({ name: a.name, slug: a.slug }))}
      user={{ name: user.name, email: user.email }}
      bell={<NotificationBell />}
    >
      {children}
    </ActShell>
  );
}
