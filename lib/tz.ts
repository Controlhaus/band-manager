import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Timezone helpers. All datetimes are stored in UTC (§14.1); acts carry an
 * IANA timezone used for input parsing and display.
 */

/** Convert a wall-clock value (as entered in the act's tz) to a UTC Date. */
export function zonedInputToUtc(localDateTime: string, timeZone: string): Date {
  // localDateTime is a value like "2026-07-20T19:30" (no zone).
  return fromZonedTime(localDateTime, timeZone);
}

/** Format a UTC Date for display in the act's timezone. */
export function formatInAct(
  date: Date,
  timeZone: string,
  fmt = "yyyy-MM-dd HH:mm",
): string {
  return formatInTimeZone(date, timeZone, fmt);
}

/** Produce a value usable in a <input type="datetime-local"> for the act's tz. */
export function toLocalInputValue(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm");
}

/** Get the act-local calendar day (YYYY-MM-DD) for a UTC date. */
export function actLocalDay(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

/** Convert a UTC date to a zoned Date (for date-fns calendar math). */
export function toActZoned(date: Date, timeZone: string): Date {
  return toZonedTime(date, timeZone);
}

const IANA_RE = /^[A-Za-z]+\/[A-Za-z0-9_+\-/]+$/;

/** Best-effort validation that a string is a plausible IANA timezone. */
export function isValidTimeZone(tz: string): boolean {
  if (tz === "UTC") return true;
  if (!IANA_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
