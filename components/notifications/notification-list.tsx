"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NotificationVM } from "./notification-menu";

export function NotificationList({
  unread,
  items,
}: {
  unread: number;
  items: NotificationVM[];
}) {
  const router = useRouter();

  async function openItem(n: NotificationVM) {
    if (!n.read) await markNotificationRead({ id: n.id });
    router.push(n.linkPath);
    router.refresh();
  }

  async function markAll() {
    await markAllNotificationsRead();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll}>
            Mark all read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  "block w-full p-3 text-left hover:bg-accent",
                  !n.read && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <div className="min-w-0">
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
