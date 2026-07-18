"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { actModules } from "@/lib/modules";
import { roleAtLeast } from "@/lib/roles";
import type { ActRole } from "@prisma/client";
import { UserMenu } from "./user-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ActSummary = { name: string; slug: string };

export function ActShell({
  act,
  acts,
  user,
  bell,
  children,
}: {
  act: { name: string; slug: string; role: ActRole };
  acts: ActSummary[];
  user: { name: string; email: string };
  bell?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/acts/${act.slug}`;

  const nav = actModules.filter((m) => roleAtLeast(act.role, m.minRole));
  const canEditSettings = roleAtLeast(act.role, "ADMIN");

  function isActive(path: string): boolean {
    const href = `${base}${path}`;
    if (path === "") return pathname === base;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <div className="p-3">
          <ActSwitcher act={act} acts={acts} />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.key}
                href={`${base}${m.path}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(m.path)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </Link>
            );
          })}
          {canEditSettings && (
            <Link
              href={`${base}/settings`}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive("/settings")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
        </nav>
        <div className="p-3">
          <div className="flex items-center justify-between rounded-md border bg-background p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
            <div className="flex items-center">
              {bell}
              <UserMenu name={user.name} email={user.email} />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b p-3 md:hidden">
        <ActSwitcher act={act} acts={acts} />
        <div className="flex items-center">
          {bell}
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>
      </main>

      {/* Mobile bottom nav (§14.12) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background md:hidden">
        {nav.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.key}
              href={`${base}${m.path}`}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                isActive(m.path)
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {m.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function ActSwitcher({
  act,
  acts,
}: {
  act: { name: string; slug: string };
  acts: ActSummary[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="truncate">{act.name}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your acts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {acts.map((a) => (
          <DropdownMenuItem key={a.slug} asChild>
            <Link href={`/acts/${a.slug}`}>{a.name}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/acts">All acts…</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
