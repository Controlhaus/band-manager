import { formatInTimeZone } from "date-fns-tz";

/**
 * Minimal RFC 5545 VCALENDAR generation (§17.4). Times are emitted as UTC
 * (Z-suffixed). SEQUENCE carries the entry version so date changes propagate to
 * subscribed calendars.
 */

export type IcsEvent = {
  uid: string;
  version: number;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location: string | null;
  description: string | null;
};

function fmt(d: Date): string {
  return formatInTimeZone(d, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold long lines to 75 octets per RFC 5545. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

export function buildIcs(events: IcsEvent[]): string {
  const now = fmt(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Band Manager//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Band Manager gigs",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@band-manager`,
      `DTSTAMP:${now}`,
      `SEQUENCE:${e.version}`,
      `DTSTART:${fmt(e.startsAt)}`,
      `DTEND:${fmt(e.endsAt)}`,
      fold(`SUMMARY:${escapeText(e.summary)}`),
    );
    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${escapeText(e.description)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
