import Link from "next/link";
import { requireSession } from "@/lib/session";
import { UserMenu } from "@/components/app-shell/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Profile</h1>
          <Link
            href="/acts"
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            My acts
          </Link>
        </div>
        <div className="flex items-center">
          <NotificationBell />
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
