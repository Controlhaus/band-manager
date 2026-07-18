"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatInAct, zonedInputToUtc } from "@/lib/tz";
import { deleteAssetsFor } from "@/lib/files";
import {
  entryFieldsSchema,
  buildTimes,
  diffMaterial,
  type EntryFields,
  type MaterialSnapshot,
} from "@/lib/entry-form";
import {
  actMemberIds,
  createNotifications,
  emailNotifications,
  type NotificationInput,
} from "@/lib/notifications";
import {
  AuthorizationError,
  requireCapability,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function actContext(actId: string) {
  return prisma.act.findUnique({
    where: { id: actId },
    select: { id: true, slug: true, timezone: true },
  });
}

async function entryContext(entryId: string) {
  return prisma.calendarEntry.findUnique({
    where: { id: entryId },
    select: { id: true, actId: true, act: { select: { slug: true, timezone: true } } },
  });
}

type EntryInput = EntryFields;

async function validateEventType(
  kind: "REHEARSAL" | "EVENT",
  eventTypeId: string | null | undefined,
  actId: string,
): Promise<string | null | { error: string }> {
  if (kind !== "EVENT") return null;
  if (!eventTypeId) return { error: "Choose an event type for events." };
  const et = await prisma.eventType.findFirst({
    where: { id: eventTypeId, OR: [{ actId: null }, { actId }] },
    select: { id: true },
  });
  if (!et) return { error: "Invalid event type." };
  return eventTypeId;
}

export async function createCalendarEntry(
  input: EntryInput & { actId: string },
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, ...rest } = z
      .object({ actId: z.string().min(1) })
      .and(entryFieldsSchema)
      .parse(input);
    await requireCapability(user, actId, "calendar:write");

    const act = await actContext(actId);
    if (!act) return { ok: false, error: "Act not found." };

    const built = buildTimes(rest, act.timezone);
    if (!built.ok) return { ok: false, error: built.error };
    const times = built.times;


    const et = await validateEventType(rest.kind, rest.eventTypeId, actId);
    if (et && typeof et === "object") return { ok: false, error: et.error };

    const entry = await prisma.calendarEntry.create({
      data: {
        actId,
        kind: rest.kind,
        eventTypeId: rest.kind === "EVENT" ? (et as string) : null,
        title: rest.title,
        startsAt: times.startsAt,
        loadInAt: times.loadInAt,
        soundcheckAt: times.soundcheckAt,
        downbeatAt: times.downbeatAt,
        loadOutAt: times.loadOutAt,
        locationName: rest.locationName || null,
        locationAddress: rest.locationAddress || null,
        locationUrl: rest.locationUrl || null,
        notes: rest.notes || null,
        createdById: user.id,
      },
      select: { id: true },
    });
    revalidatePath(`/acts/${act.slug}/calendar`);
    return { ok: true, data: { id: entry.id } };
  });
}

export async function updateCalendarEntry(
  input: EntryInput & { entryId: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, ...rest } = z
      .object({ entryId: z.string().min(1) })
      .and(entryFieldsSchema)
      .parse(input);

    const existing = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      include: { act: { select: { slug: true, timezone: true, name: true } } },
    });
    if (!existing) return { ok: false, error: "Entry not found." };
    await requireCapability(user, existing.actId, "calendar:write");

    const built = buildTimes(rest, existing.act.timezone);
    if (!built.ok) return { ok: false, error: built.error };
    const times = built.times;

    const et = await validateEventType(rest.kind, rest.eventTypeId, existing.actId);
    if (et && typeof et === "object") return { ok: false, error: et.error };
    const eventTypeId = rest.kind === "EVENT" ? (et as string) : null;

    // Change protection on CONFIRMED entries (§17.2): compare material fields.
    let materialChanges: { field: string; old: string | null; new: string | null }[] = [];
    if (existing.status === "CONFIRMED") {
      const before: MaterialSnapshot = {
        startsAt: existing.startsAt,
        loadInAt: existing.loadInAt,
        soundcheckAt: existing.soundcheckAt,
        downbeatAt: existing.downbeatAt,
        loadOutAt: existing.loadOutAt,
        locationName: existing.locationName,
        locationAddress: existing.locationAddress,
        locationUrl: existing.locationUrl,
        eventTypeId: existing.eventTypeId,
        kind: existing.kind,
      };
      const after: MaterialSnapshot = {
        startsAt: times.startsAt,
        loadInAt: times.loadInAt,
        soundcheckAt: times.soundcheckAt,
        downbeatAt: times.downbeatAt,
        loadOutAt: times.loadOutAt,
        locationName: rest.locationName || null,
        locationAddress: rest.locationAddress || null,
        locationUrl: rest.locationUrl || null,
        eventTypeId,
        kind: rest.kind,
      };
      materialChanges = diffMaterial(before, after);
    }

    const bumped = materialChanges.length > 0;

    await prisma.$transaction(async (tx) => {
      await tx.calendarEntry.update({
        where: { id: entryId },
        data: {
          kind: rest.kind,
          eventTypeId,
          title: rest.title,
          startsAt: times.startsAt,
          loadInAt: times.loadInAt,
          soundcheckAt: times.soundcheckAt,
          downbeatAt: times.downbeatAt,
          loadOutAt: times.loadOutAt,
          locationName: rest.locationName || null,
          locationAddress: rest.locationAddress || null,
          locationUrl: rest.locationUrl || null,
          notes: rest.notes || null,
          ...(bumped ? { version: { increment: 1 } } : {}),
        },
      });
      if (bumped) {
        await tx.entryChangeLog.create({
          data: { entryId, changedById: user.id, changes: materialChanges },
        });
        const memberIds = await actMemberIds(existing.actId, tx);
        await createNotifications(tx, memberIds, changedNotification(existing));
      }
    });

    if (bumped) {
      const memberIds = await actMemberIds(existing.actId);
      await emailNotifications(memberIds, changedNotification(existing));
    }

    revalidatePath(`/acts/${existing.act.slug}/calendar`);
    revalidatePath(`/acts/${existing.act.slug}/calendar/${entryId}`);
    return { ok: true };
  });
}

function changedNotification(entry: {
  id: string;
  title: string;
  startsAt: Date;
  act: { slug: string; timezone: string; name: string };
}): NotificationInput {
  const when = formatInAct(entry.startsAt, entry.act.timezone, "EEE d MMM yyyy, HH:mm");
  return {
    type: "ENTRY_CHANGED",
    title: `Updated: ${entry.title} (${entry.act.name})`,
    body: `Details changed for "${entry.title}" on ${when}. Please re-confirm your attendance.`,
    linkPath: `/acts/${entry.act.slug}/calendar/${entry.id}`,
  };
}

export async function updateEntryNotes(input: {
  entryId: string;
  notes: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, notes } = z
      .object({ entryId: z.string().min(1), notes: z.string().max(10000) })
      .parse(input);
    const ctx = await entryContext(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.actId, "entry:addNotes");
    await prisma.calendarEntry.update({
      where: { id: entryId },
      data: { notes: notes || null },
    });
    revalidatePath(`/acts/${ctx.act.slug}/calendar/${entryId}`);
    return { ok: true };
  });
}

export async function deleteCalendarEntry(input: {
  entryId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId } = z.object({ entryId: z.string().min(1) }).parse(input);
    const ctx = await entryContext(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.actId, "calendar:write");

    // Cascade removes attendance/setlists/items; clean polymorphic files.
    await prisma.$transaction(async (tx) => {
      await deleteAssetsFor("CALENDAR_ENTRY", entryId, tx);
      await tx.calendarEntry.delete({ where: { id: entryId } });
    });
    revalidatePath(`/acts/${ctx.act.slug}/calendar`);
    return { ok: true };
  });
}

/** Duplicate an entry to a new start (§14.13). Copies setlists, not attendance. */
export async function duplicateEntry(input: {
  entryId: string;
  startsAt: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, startsAt } = z
      .object({ entryId: z.string().min(1), startsAt: z.string().min(1) })
      .parse(input);
    const ctx = await entryContext(entryId);
    if (!ctx) return { ok: false, error: "Entry not found." };
    await requireCapability(user, ctx.actId, "calendar:write");

    const src = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      include: { setlists: { include: { items: true } } },
    });
    if (!src) return { ok: false, error: "Entry not found." };

    const newStart = zonedInputToUtc(startsAt, ctx.act.timezone);

    const created = await prisma.$transaction(async (tx) => {
      const entry = await tx.calendarEntry.create({
        data: {
          actId: src.actId,
          kind: src.kind,
          eventTypeId: src.eventTypeId,
          title: `${src.title} (copy)`,
          startsAt: newStart,
          locationName: src.locationName,
          locationAddress: src.locationAddress,
          locationUrl: src.locationUrl,
          notes: src.notes,
          createdById: user.id,
        },
        select: { id: true },
      });
      for (const sl of src.setlists) {
        await tx.setlist.create({
          data: {
            entryId: entry.id,
            name: sl.name,
            sortOrder: sl.sortOrder,
            items: {
              create: sl.items.map((it) => ({
                position: it.position,
                songId: it.songId,
                songVersionId: it.songVersionId,
                notes: it.notes,
              })),
            },
          },
        });
      }
      return entry;
    });

    revalidatePath(`/acts/${ctx.act.slug}/calendar`);
    return { ok: true, data: { id: created.id } };
  });
}

// ---- Attendance (§16.5) ----

export async function setAttendance(input: {
  entryId: string;
  statusKey: string | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, statusKey } = z
      .object({
        entryId: z.string().min(1),
        statusKey: z.string().nullable(),
      })
      .parse(input);
    const entry = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      select: { actId: true, status: true, version: true, act: { select: { slug: true } } },
    });
    if (!entry) return { ok: false, error: "Entry not found." };
    await requireCapability(user, entry.actId, "attendance:setOwn");

    if (statusKey === null) {
      await prisma.attendance
        .delete({ where: { entryId_userId: { entryId, userId: user.id } } })
        .catch(() => undefined);
    } else {
      const status = await prisma.attendanceStatus.findUnique({
        where: { key: statusKey },
      });
      if (!status) return { ok: false, error: "Invalid status." };
      await prisma.$transaction(async (tx) => {
        await tx.attendance.upsert({
          where: { entryId_userId: { entryId, userId: user.id } },
          create: { entryId, userId: user.id, statusKey },
          update: { statusKey },
        });
        // On a CONFIRMED entry, setting your status is itself an on-record
        // acknowledgement at the current version (§17.2).
        if (entry.status === "CONFIRMED") {
          await tx.entryAcknowledgement.upsert({
            where: { entryId_userId: { entryId, userId: user.id } },
            create: { entryId, userId: user.id, versionAtAck: entry.version },
            update: { versionAtAck: entry.version, acknowledgedAt: new Date() },
          });
        }
      });
    }
    revalidatePath(`/acts/${entry.act.slug}/calendar/${entryId}`);
    return { ok: true };
  });
}

/**
 * Explicit attendance acknowledgement by a pending/stale member (§17.2). Sets
 * the caller's status and records the acknowledgement at the current version.
 */
export async function acknowledgeEntry(input: {
  entryId: string;
  statusKey: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, statusKey } = z
      .object({ entryId: z.string().min(1), statusKey: z.string().min(1) })
      .parse(input);
    const entry = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      select: { actId: true, version: true, act: { select: { slug: true } } },
    });
    if (!entry) return { ok: false, error: "Entry not found." };
    await requireCapability(user, entry.actId, "booking:respond");

    const status = await prisma.attendanceStatus.findUnique({ where: { key: statusKey } });
    if (!status) return { ok: false, error: "Invalid status." };

    await prisma.$transaction(async (tx) => {
      await tx.attendance.upsert({
        where: { entryId_userId: { entryId, userId: user.id } },
        create: { entryId, userId: user.id, statusKey },
        update: { statusKey },
      });
      await tx.entryAcknowledgement.upsert({
        where: { entryId_userId: { entryId, userId: user.id } },
        create: { entryId, userId: user.id, versionAtAck: entry.version },
        update: { versionAtAck: entry.version, acknowledgedAt: new Date() },
      });
    });
    revalidatePath(`/acts/${entry.act.slug}/calendar/${entryId}`);
    return { ok: true };
  });
}

/** Cancel a confirmed (or any) gig entry (§17.2): status → CANCELLED, logged. */
export async function cancelCalendarEntry(input: {
  entryId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId } = z.object({ entryId: z.string().min(1) }).parse(input);
    const entry = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      include: { act: { select: { slug: true, timezone: true, name: true } } },
    });
    if (!entry) return { ok: false, error: "Entry not found." };
    await requireCapability(user, entry.actId, "booking:manage");
    if (entry.status === "CANCELLED") return { ok: true };

    const note: NotificationInput = {
      type: "BOOKING_CANCELLED",
      title: `Cancelled: ${entry.title} (${entry.act.name})`,
      body: `"${entry.title}" on ${formatInAct(entry.startsAt, entry.act.timezone, "EEE d MMM yyyy, HH:mm")} has been cancelled.`,
      linkPath: `/acts/${entry.act.slug}/calendar/${entryId}`,
    };

    await prisma.$transaction(async (tx) => {
      await tx.calendarEntry.update({
        where: { id: entryId },
        data: { status: "CANCELLED", version: { increment: 1 } },
      });
      await tx.entryChangeLog.create({
        data: {
          entryId,
          changedById: user.id,
          changes: [{ field: "status", old: entry.status, new: "CANCELLED" }],
        },
      });
      const memberIds = await actMemberIds(entry.actId, tx);
      await createNotifications(tx, memberIds, note);
    });
    await emailNotifications(await actMemberIds(entry.actId), note);

    revalidatePath(`/acts/${entry.act.slug}/calendar`);
    revalidatePath(`/acts/${entry.act.slug}/calendar/${entryId}`);
    return { ok: true };
  });
}

// ---- Event types (§14.8) ----

const eventTypeSchema = z.object({
  id: z.string().optional(),
  actId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(100),
  sortOrder: z.number().int().optional(),
});

export async function upsertEventType(
  input: z.infer<typeof eventTypeSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = eventTypeSchema.parse(input);
    await requireCapability(user, data.actId, "act:edit");

    if (data.id) {
      // Only act-scoped rows are editable by act admins.
      const existing = await prisma.eventType.findUnique({
        where: { id: data.id },
      });
      if (!existing || existing.actId !== data.actId) {
        return { ok: false, error: "You can only edit this act's event types." };
      }
      await prisma.eventType.update({
        where: { id: data.id },
        data: { name: data.name, sortOrder: data.sortOrder ?? existing.sortOrder },
      });
    } else {
      await prisma.eventType.create({
        data: { actId: data.actId, name: data.name, sortOrder: data.sortOrder ?? 100 },
      });
    }
    const act = await actContext(data.actId);
    if (act) revalidatePath(`/acts/${act.slug}/settings`);
    return { ok: true };
  });
}

export async function deleteEventType(input: {
  actId: string;
  id: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, id } = z
      .object({ actId: z.string().min(1), id: z.string().min(1) })
      .parse(input);
    await requireCapability(user, actId, "act:edit");

    const existing = await prisma.eventType.findUnique({ where: { id } });
    if (!existing || existing.actId !== actId) {
      return { ok: false, error: "You can only delete this act's event types." };
    }
    const refs = await prisma.calendarEntry.count({ where: { eventTypeId: id } });
    if (refs > 0) {
      return {
        ok: false,
        error: "This event type is in use. Reassign those entries first.",
      };
    }
    await prisma.eventType.delete({ where: { id } });
    const act = await actContext(actId);
    if (act) revalidatePath(`/acts/${act.slug}/settings`);
    return { ok: true };
  });
}

/**
 * Enable/disable a GLOBAL event type for a single act so unused ones can be
 * hidden from the picker. Act-scoped types are managed via upsert/delete.
 */
export async function setGlobalEventTypeEnabled(input: {
  actId: string;
  eventTypeId: string;
  enabled: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { actId, eventTypeId, enabled } = z
      .object({
        actId: z.string().min(1),
        eventTypeId: z.string().min(1),
        enabled: z.boolean(),
      })
      .parse(input);
    await requireCapability(user, actId, "act:edit");

    const et = await prisma.eventType.findUnique({ where: { id: eventTypeId } });
    if (!et || et.actId !== null) {
      return { ok: false, error: "Only global event types can be toggled here." };
    }

    if (enabled) {
      await prisma.actDisabledEventType
        .delete({ where: { actId_eventTypeId: { actId, eventTypeId } } })
        .catch(() => undefined);
    } else {
      await prisma.actDisabledEventType.upsert({
        where: { actId_eventTypeId: { actId, eventTypeId } },
        create: { actId, eventTypeId },
        update: {},
      });
    }
    const act = await actContext(actId);
    if (act) {
      revalidatePath(`/acts/${act.slug}/settings`);
      revalidatePath(`/acts/${act.slug}/calendar`);
    }
    return { ok: true };
  });
}
