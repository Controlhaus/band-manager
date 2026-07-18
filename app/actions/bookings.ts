"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatInAct, zonedInputToUtc } from "@/lib/tz";
import { entryFieldsSchema, buildTimes, type EntryFields } from "@/lib/entry-form";
import {
  actMemberIds,
  createNotifications,
  emailNotifications,
  type NotificationInput,
} from "@/lib/notifications";
import {
  AuthorizationError,
  requireCapability,
  getEffectiveActRole,
  type SessionUser,
} from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/action";

// Seeded attendance status keys referenced when binding availability (§17.2).
const ATTENDING = "attending";
const NOT_ATTENDING = "not_attending";

async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("You must be signed in.");
  return session;
}

async function actContext(actId: string) {
  return prisma.act.findUnique({
    where: { id: actId },
    select: { id: true, slug: true, timezone: true, name: true },
  });
}

async function validateEventTypeFor(
  actId: string,
  kind: "REHEARSAL" | "EVENT",
  eventTypeId: string | null | undefined,
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

type CandidateData = {
  kind: "REHEARSAL" | "EVENT";
  eventTypeId: string | null;
  title: string;
  startsAt: Date;
  loadInAt: Date | null;
  soundcheckAt: Date | null;
  downbeatAt: Date | null;
  loadOutAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
  locationUrl: string | null;
  notes: string | null;
};

async function buildCandidate(
  actId: string,
  tz: string,
  fields: EntryFields,
): Promise<{ ok: true; data: CandidateData } | { ok: false; error: string }> {
  const built = buildTimes(fields, tz);
  if (!built.ok) return { ok: false, error: built.error };
  const et = await validateEventTypeFor(actId, fields.kind, fields.eventTypeId);
  if (et && typeof et === "object") return { ok: false, error: et.error };
  return {
    ok: true,
    data: {
      kind: fields.kind,
      eventTypeId: fields.kind === "EVENT" ? (et as string) : null,
      title: fields.title,
      startsAt: built.times.startsAt,
      loadInAt: built.times.loadInAt,
      soundcheckAt: built.times.soundcheckAt,
      downbeatAt: built.times.downbeatAt,
      loadOutAt: built.times.loadOutAt,
      locationName: fields.locationName || null,
      locationAddress: fields.locationAddress || null,
      locationUrl: fields.locationUrl || null,
      notes: fields.notes || null,
    },
  };
}

function pollNotification(
  group: { id: string; title: string },
  act: { slug: string; name: string },
): NotificationInput {
  return {
    type: "BOOKING_POLL",
    title: `New booking poll: ${group.title} (${act.name})`,
    body: `You've been asked to mark your availability for "${group.title}". Available = you're committing to play if this date is chosen.`,
    linkPath: `/acts/${act.slug}/bookings/${group.id}`,
  };
}

// ---- Create / edit ----

const createSchema = z.object({
  actId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required.").max(200),
  customerName: z.string().trim().max(200).optional(),
  customerContact: z.string().trim().max(200).optional(),
  venueNotes: z.string().trim().max(2000).optional(),
  responseDeadline: z.string().optional(),
  candidates: z.array(entryFieldsSchema).min(1, "Add at least one candidate date."),
});

export async function createBookingGroup(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = createSchema.parse(input);
    await requireCapability(user, data.actId, "booking:manage");

    const act = await actContext(data.actId);
    if (!act) return { ok: false, error: "Act not found." };

    const candidates: CandidateData[] = [];
    for (const c of data.candidates) {
      const built = await buildCandidate(act.id, act.timezone, c);
      if (!built.ok) return { ok: false, error: built.error };
      candidates.push(built.data);
    }

    const deadline = data.responseDeadline
      ? zonedInputToUtc(data.responseDeadline, act.timezone)
      : null;

    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.bookingGroup.create({
        data: {
          actId: act.id,
          title: data.title,
          customerName: data.customerName || null,
          customerContact: data.customerContact || null,
          venueNotes: data.venueNotes || null,
          responseDeadline: deadline,
          createdById: user.id,
        },
        select: { id: true, title: true },
      });
      for (const c of candidates) {
        await tx.calendarEntry.create({
          data: { ...c, actId: act.id, status: "TENTATIVE", bookingGroupId: g.id, createdById: user.id },
        });
      }
      const memberIds = await actMemberIds(act.id, tx);
      await createNotifications(tx, memberIds, pollNotification(g, act));
      return g;
    });

    await emailNotifications(await actMemberIds(act.id), pollNotification(group, act));
    revalidatePath(`/acts/${act.slug}/bookings`);
    revalidatePath(`/acts/${act.slug}/calendar`);
    return { ok: true, data: { id: group.id } };
  });
}

const metaSchema = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  customerName: z.string().trim().max(200).optional(),
  customerContact: z.string().trim().max(200).optional(),
  venueNotes: z.string().trim().max(2000).optional(),
  responseDeadline: z.string().optional(),
});

export async function updateBookingGroup(
  input: z.infer<typeof metaSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const data = metaSchema.parse(input);
    const group = await prisma.bookingGroup.findUnique({
      where: { id: data.groupId },
      include: { act: { select: { slug: true, timezone: true } } },
    });
    if (!group) return { ok: false, error: "Booking not found." };
    await requireCapability(user, group.actId, "booking:manage");

    await prisma.bookingGroup.update({
      where: { id: group.id },
      data: {
        title: data.title,
        customerName: data.customerName || null,
        customerContact: data.customerContact || null,
        venueNotes: data.venueNotes || null,
        responseDeadline: data.responseDeadline
          ? zonedInputToUtc(data.responseDeadline, group.act.timezone)
          : null,
      },
    });
    revalidatePath(`/acts/${group.act.slug}/bookings/${group.id}`);
    return { ok: true };
  });
}

export async function addBookingCandidate(
  input: EntryFields & { groupId: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { groupId, ...fields } = z
      .object({ groupId: z.string().min(1) })
      .and(entryFieldsSchema)
      .parse(input);
    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { act: { select: { slug: true, timezone: true } } },
    });
    if (!group) return { ok: false, error: "Booking not found." };
    await requireCapability(user, group.actId, "booking:manage");
    if (group.status !== "OPEN") {
      return { ok: false, error: "This booking is no longer open." };
    }
    const built = await buildCandidate(group.actId, group.act.timezone, fields);
    if (!built.ok) return { ok: false, error: built.error };
    await prisma.calendarEntry.create({
      data: { ...built.data, actId: group.actId, status: "TENTATIVE", bookingGroupId: group.id, createdById: user.id },
    });
    revalidatePath(`/acts/${group.act.slug}/bookings/${group.id}`);
    revalidatePath(`/acts/${group.act.slug}/calendar`);
    return { ok: true };
  });
}

export async function removeBookingCandidate(input: {
  entryId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId } = z.object({ entryId: z.string().min(1) }).parse(input);
    const entry = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      include: { act: { select: { slug: true } }, bookingGroup: true },
    });
    if (!entry || !entry.bookingGroup) return { ok: false, error: "Candidate not found." };
    await requireCapability(user, entry.actId, "booking:manage");
    if (entry.bookingGroup.status !== "OPEN") {
      return { ok: false, error: "This booking is no longer open." };
    }
    const count = await prisma.calendarEntry.count({
      where: { bookingGroupId: entry.bookingGroupId },
    });
    if (count <= 1) {
      return { ok: false, error: "A booking must keep at least one candidate date." };
    }
    await prisma.calendarEntry.delete({ where: { id: entryId } });
    revalidatePath(`/acts/${entry.act.slug}/bookings/${entry.bookingGroupId}`);
    revalidatePath(`/acts/${entry.act.slug}/calendar`);
    return { ok: true };
  });
}

// ---- Availability poll ----

export async function setAvailability(input: {
  entryId: string;
  answer: "AVAILABLE" | "NOT_AVAILABLE" | "MAYBE" | null;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { entryId, answer } = z
      .object({
        entryId: z.string().min(1),
        answer: z.enum(["AVAILABLE", "NOT_AVAILABLE", "MAYBE"]).nullable(),
      })
      .parse(input);
    const entry = await prisma.calendarEntry.findUnique({
      where: { id: entryId },
      include: { act: { select: { slug: true } }, bookingGroup: true },
    });
    if (!entry || !entry.bookingGroup) return { ok: false, error: "Candidate not found." };
    await requireCapability(user, entry.actId, "booking:respond");
    if (entry.bookingGroup.status !== "OPEN") {
      return { ok: false, error: "This poll is closed." };
    }

    if (answer === null) {
      await prisma.availabilityResponse
        .delete({ where: { entryId_userId: { entryId, userId: user.id } } })
        .catch(() => undefined);
    } else {
      await prisma.availabilityResponse.upsert({
        where: { entryId_userId: { entryId, userId: user.id } },
        create: { entryId, userId: user.id, answer, respondedAt: new Date() },
        update: { answer, respondedAt: new Date() },
      });
    }
    revalidatePath(`/acts/${entry.act.slug}/bookings/${entry.bookingGroupId}`);
    return { ok: true };
  });
}

// ---- Nudge ----

export async function nudgeBooking(input: {
  groupId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { groupId } = z.object({ groupId: z.string().min(1) }).parse(input);
    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { act: { select: { slug: true, name: true } }, candidates: { select: { id: true } } },
    });
    if (!group) return { ok: false, error: "Booking not found." };

    // Creator or act admin only (§17.2).
    const role = await getEffectiveActRole(user, group.actId);
    const isAdmin = role === "ADMIN";
    if (!isAdmin && group.createdById !== user.id) {
      throw new AuthorizationError("Only the booking creator or an act admin can nudge.");
    }
    if (group.status !== "OPEN") return { ok: false, error: "This poll is closed." };

    const candidateIds = group.candidates.map((c) => c.id);
    const memberIds = await actMemberIds(group.actId);
    const responses = await prisma.availabilityResponse.findMany({
      where: { entryId: { in: candidateIds } },
      select: { userId: true, entryId: true },
    });
    // Members missing a response on ≥1 candidate.
    const missing = memberIds.filter((uid) => {
      const answered = new Set(
        responses.filter((r) => r.userId === uid).map((r) => r.entryId),
      );
      return candidateIds.some((cid) => !answered.has(cid));
    });
    if (missing.length === 0) {
      return { ok: false, error: "Everyone has responded." };
    }

    const note: NotificationInput = {
      type: "NUDGE",
      title: `Reminder: respond to ${group.title} (${group.act.name})`,
      body: `Please mark your availability for "${group.title}".`,
      linkPath: `/acts/${group.act.slug}/bookings/${group.id}`,
    };
    await prisma.$transaction(async (tx) => {
      await createNotifications(tx, missing, note);
    });
    await emailNotifications(missing, note);
    revalidatePath(`/acts/${group.act.slug}/bookings/${group.id}`);
    return { ok: true };
  });
}

// ---- Confirm ----

const confirmSchema = z.object({
  groupId: z.string().min(1),
  entryId: z.string().min(1),
  confirmTitle: z.string(),
});

export async function confirmBookingDate(
  input: z.infer<typeof confirmSchema>,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { groupId, entryId, confirmTitle } = confirmSchema.parse(input);
    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: {
        act: { select: { slug: true, timezone: true, name: true } },
        candidates: true,
      },
    });
    if (!group) return { ok: false, error: "Booking not found." };
    await requireCapability(user, group.actId, "booking:manage");
    if (group.status !== "OPEN") return { ok: false, error: "This booking is already resolved." };

    const winner = group.candidates.find((c) => c.id === entryId);
    if (!winner) return { ok: false, error: "That date isn't part of this booking." };
    if (confirmTitle.trim() !== winner.title) {
      return { ok: false, error: "The typed title does not match the chosen date." };
    }

    const responses = await prisma.availabilityResponse.findMany({
      where: { entryId: winner.id },
    });

    const note: NotificationInput = {
      type: "DATE_CONFIRMED",
      title: `Confirmed: ${winner.title} (${group.act.name})`,
      body: `"${winner.title}" is confirmed for ${formatInAct(winner.startsAt, group.act.timezone, "EEE d MMM yyyy, HH:mm")}. If you didn't answer "Available", please confirm your attendance.`,
      linkPath: `/acts/${group.act.slug}/calendar/${winner.id}`,
    };

    const memberIds = await actMemberIds(group.actId);

    await prisma.$transaction(async (tx) => {
      // Winner confirmed; siblings cancelled.
      await tx.calendarEntry.update({
        where: { id: winner.id },
        data: { status: "CONFIRMED" },
      });
      await tx.calendarEntry.updateMany({
        where: { bookingGroupId: group.id, id: { not: winner.id } },
        data: { status: "CANCELLED" },
      });
      await tx.bookingGroup.update({
        where: { id: group.id },
        data: { status: "CONFIRMED", confirmedEntryId: winner.id },
      });

      // Binding attendance seeding from the winner's poll answers (§17.2).
      for (const r of responses) {
        if (r.answer === "MAYBE") continue; // pending
        const statusKey = r.answer === "AVAILABLE" ? ATTENDING : NOT_ATTENDING;
        await tx.attendance.upsert({
          where: { entryId_userId: { entryId: winner.id, userId: r.userId } },
          create: { entryId: winner.id, userId: r.userId, statusKey },
          update: { statusKey },
        });
        await tx.entryAcknowledgement.upsert({
          where: { entryId_userId: { entryId: winner.id, userId: r.userId } },
          create: {
            entryId: winner.id,
            userId: r.userId,
            acknowledgedAt: r.respondedAt,
            versionAtAck: 1,
          },
          update: { acknowledgedAt: r.respondedAt, versionAtAck: 1 },
        });
      }

      await createNotifications(tx, memberIds, note);
    });

    await emailNotifications(memberIds, note);
    revalidatePath(`/acts/${group.act.slug}/bookings/${group.id}`);
    revalidatePath(`/acts/${group.act.slug}/calendar`);
    revalidatePath(`/acts/${group.act.slug}/calendar/${winner.id}`);
    return { ok: true };
  });
}

// ---- Cancel booking group (OPEN) ----

export async function cancelBookingGroup(input: {
  groupId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const { groupId } = z.object({ groupId: z.string().min(1) }).parse(input);
    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { act: { select: { slug: true, name: true } } },
    });
    if (!group) return { ok: false, error: "Booking not found." };
    await requireCapability(user, group.actId, "booking:manage");
    if (group.status !== "OPEN") {
      return { ok: false, error: "Only an open booking can be cancelled here." };
    }

    const note: NotificationInput = {
      type: "BOOKING_CANCELLED",
      title: `Booking cancelled: ${group.title} (${group.act.name})`,
      body: `The booking "${group.title}" has been cancelled.`,
      linkPath: `/acts/${group.act.slug}/bookings/${group.id}`,
    };
    const memberIds = await actMemberIds(group.actId);

    await prisma.$transaction(async (tx) => {
      await tx.calendarEntry.updateMany({
        where: { bookingGroupId: group.id },
        data: { status: "CANCELLED" },
      });
      await tx.bookingGroup.update({
        where: { id: group.id },
        data: { status: "CANCELLED" },
      });
      await createNotifications(tx, memberIds, note);
    });
    await emailNotifications(memberIds, note);
    revalidatePath(`/acts/${group.act.slug}/bookings`);
    revalidatePath(`/acts/${group.act.slug}/calendar`);
    return { ok: true };
  });
}
