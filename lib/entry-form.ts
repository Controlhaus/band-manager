import { z } from "zod";
import { zonedInputToUtc } from "@/lib/tz";

/**
 * Shared calendar-entry form schema + time handling, used by both the calendar
 * module and the booking flow (§7.4, §16.4, §17).
 */

export const entryFieldsSchema = z.object({
  kind: z.enum(["REHEARSAL", "EVENT"]),
  eventTypeId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "Title is required.").max(200),
  startsAt: z.string().min(1, "Start date & time is required."),
  addDownbeat: z.boolean().optional().default(false),
  loadInAt: z.string().optional(),
  soundcheckAt: z.string().optional(),
  loadOutAt: z.string().optional(),
  locationName: z.string().trim().max(200).optional(),
  locationAddress: z.string().trim().max(400).optional(),
  locationUrl: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(10000).optional(),
});

export type EntryFields = z.infer<typeof entryFieldsSchema>;

function toUtc(local: string | undefined, tz: string): Date | null {
  if (!local) return null;
  return zonedInputToUtc(local, tz);
}

export type BuiltTimes = {
  startsAt: Date;
  loadInAt: Date | null;
  soundcheckAt: Date | null;
  downbeatAt: Date | null;
  loadOutAt: Date | null;
};

/** Build + validate the datetime fields (§16.4). */
export function buildTimes(
  data: EntryFields,
  tz: string,
): { ok: true; times: BuiltTimes } | { ok: false; error: string } {
  const startsAt = toUtc(data.startsAt, tz);
  if (!startsAt) return { ok: false, error: "Start date & time is required." };
  const loadInAt = toUtc(data.loadInAt, tz);
  const soundcheckAt = toUtc(data.soundcheckAt, tz);
  const loadOutAt = toUtc(data.loadOutAt, tz);
  const downbeatAt = data.addDownbeat ? startsAt : null;

  const chain: Array<[string, Date | null]> = [
    ["load-in", loadInAt],
    ["soundcheck", soundcheckAt],
    ["start", startsAt],
    ["load-out", loadOutAt],
  ];
  const present = chain.filter(([, d]) => d != null) as Array<[string, Date]>;
  for (let i = 1; i < present.length; i++) {
    if (present[i]![1].getTime() < present[i - 1]![1].getTime()) {
      return {
        ok: false,
        error: `Times must be in order: ${present[i - 1]![0]} cannot be after ${present[i]![0]}.`,
      };
    }
  }
  return { ok: true, times: { startsAt, loadInAt, soundcheckAt, downbeatAt, loadOutAt } };
}

/** Material fields whose change triggers re-confirmation (§17.2). */
export type MaterialSnapshot = {
  startsAt: Date;
  loadInAt: Date | null;
  soundcheckAt: Date | null;
  downbeatAt: Date | null;
  loadOutAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
  locationUrl: string | null;
  eventTypeId: string | null;
  kind: string;
};

export type FieldChange = { field: string; old: string | null; new: string | null };

function asStr(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/** Diff material fields; returns the changes (empty = nothing material changed). */
export function diffMaterial(
  before: MaterialSnapshot,
  after: MaterialSnapshot,
): FieldChange[] {
  const fields: (keyof MaterialSnapshot)[] = [
    "startsAt",
    "loadInAt",
    "soundcheckAt",
    "downbeatAt",
    "loadOutAt",
    "locationName",
    "locationAddress",
    "locationUrl",
    "eventTypeId",
    "kind",
  ];
  const changes: FieldChange[] = [];
  for (const f of fields) {
    const o = asStr(before[f] as Date | string | null);
    const n = asStr(after[f] as Date | string | null);
    if (o !== n) changes.push({ field: f, old: o, new: n });
  }
  return changes;
}
