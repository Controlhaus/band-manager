/**
 * Seed data shared by the seed script and (read-only) the app.
 */

export const ATTENDANCE_STATUSES = [
  { key: "attending", label: "Attending", color: "#16a34a", sortOrder: 1 },
  { key: "not_attending", label: "Not attending", color: "#dc2626", sortOrder: 2 },
  { key: "unsure", label: "Unsure", color: "#d97706", sortOrder: 3 },
] as const;

export const DEFAULT_EVENT_TYPES = [
  "Wedding",
  "Corporate",
  "Club",
  "Festival",
  "Private",
  "Other",
] as const;
