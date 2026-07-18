import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Music,
  Users,
} from "lucide-react";
import type { ActRole } from "@prisma/client";

/**
 * Module registry (§10). The act sidebar nav is data-driven from this list so
 * future modules (contacts, booking CRM, chat) can be added by appending an
 * entry. `path` is appended to `/acts/[slug]`.
 */

export type ModuleNavItem = {
  key: string;
  label: string;
  /** Sub-path under /acts/[slug]; "" is the dashboard root. */
  path: string;
  icon: LucideIcon;
  /** Minimum act role that can see the nav item. */
  minRole: ActRole;
};

export const actModules: ModuleNavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "", icon: LayoutDashboard, minRole: "READONLY" },
  { key: "songs", label: "Songs", path: "/songs", icon: Music, minRole: "READONLY" },
  { key: "calendar", label: "Calendar", path: "/calendar", icon: CalendarDays, minRole: "READONLY" },
  { key: "bookings", label: "Bookings", path: "/bookings", icon: ClipboardList, minRole: "READONLY" },
  { key: "members", label: "Members", path: "/members", icon: Users, minRole: "READONLY" },
];

/*
 * Future modules — commented stubs demonstrating the extension pattern (§10):
 *
 * { key: "contacts", label: "Contacts", path: "/contacts", icon: Contact, minRole: "MEMBER" },
 * { key: "booking", label: "Booking", path: "/booking", icon: Briefcase, minRole: "ADMIN" },
 * { key: "chat", label: "Chat", path: "/chat", icon: MessageSquare, minRole: "READONLY" },
 */
