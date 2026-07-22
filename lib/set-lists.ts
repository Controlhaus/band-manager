/**
 * Set List library helpers (act-level, reusable set lists referenced by
 * bookings). Totals are derived at read time from song durations + banter
 * seconds — never stored — to avoid denormalization drift.
 *
 * This module is Prisma-free so it can be imported by client components.
 */
/** Format a duration in seconds as `m:ss` (or `h:mm:ss` when ≥ 1 hour). */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** Parse a `mm:ss` (or plain seconds / `h:mm:ss`) string into total seconds. */
export function parseDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  let seconds = 0;
  for (const n of nums) seconds = seconds * 60 + n;
  return seconds;
}

type EntrySeconds = {
  kind: "SONG" | "BANTER";
  banterSeconds: number | null;
  song: { durationSec: number | null } | null;
};

/** Sum the seconds contributed by a set's entries. */
export function setSeconds(entries: EntrySeconds[]): number {
  return entries.reduce((sum, e) => {
    if (e.kind === "BANTER") return sum + (e.banterSeconds ?? 0);
    return sum + (e.song?.durationSec ?? 0);
  }, 0);
}

/** Sum the seconds across all sets in a set list. */
export function setListSeconds(sets: { entries: EntrySeconds[] }[]): number {
  return sets.reduce((sum, s) => sum + setSeconds(s.entries), 0);
}
