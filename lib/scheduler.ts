import cron from "node-cron";
import { prisma } from "./prisma";
import {
  actMemberIds,
  createNotifications,
  emailNotifications,
  type NotificationInput,
} from "./notifications";
import { runEnrichmentTick, runEnrichmentMaintenance } from "./enrichment";

/**
 * Deadline-reminder scheduler (§17.5). One node-cron job in the app process,
 * guarded by ENABLE_SCHEDULER so a future multi-container setup can pin it to a
 * single instance. Runs every 15 minutes.
 */

let started = false;

export function startScheduler(): void {
  if (started) return;
  if (process.env.ENABLE_SCHEDULER !== "true") return;
  started = true;
  cron.schedule("*/15 * * * *", () => {
    runDeadlineReminders().catch((err) =>
      console.error("[scheduler] deadline reminders failed:", err),
    );
  });
  console.log("[scheduler] deadline-reminder job scheduled (*/15 * * * *)");

  // §18.4 — async enrichment runner (every 30s) + daily cache/session prune.
  let enrichmentBusy = false;
  cron.schedule("*/30 * * * * *", () => {
    if (enrichmentBusy) return; // never overlap ticks
    enrichmentBusy = true;
    runEnrichmentTick()
      .catch((err) => console.error("[scheduler] enrichment tick failed:", err))
      .finally(() => {
        enrichmentBusy = false;
      });
  });
  cron.schedule("30 3 * * *", () => {
    runEnrichmentMaintenance().catch((err) =>
      console.error("[scheduler] enrichment maintenance failed:", err),
    );
  });
  console.log(
    "[scheduler] enrichment runner scheduled (*/30s) + maintenance (30 3 * * *)",
  );
}

export async function runDeadlineReminders(): Promise<void> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const groups = await prisma.bookingGroup.findMany({
    where: {
      status: "OPEN",
      deadlineReminderSentAt: null,
      responseDeadline: { not: null, lte: in48h, gte: now },
    },
    include: {
      act: { select: { slug: true, name: true } },
      candidates: { select: { id: true } },
    },
  });

  for (const g of groups) {
    const candidateIds = g.candidates.map((c) => c.id);
    const memberIds = await actMemberIds(g.actId);
    const responses = await prisma.availabilityResponse.findMany({
      where: { entryId: { in: candidateIds } },
      select: { userId: true, entryId: true },
    });
    const missing = memberIds.filter((uid) => {
      const answered = new Set(
        responses.filter((r) => r.userId === uid).map((r) => r.entryId),
      );
      return candidateIds.some((cid) => !answered.has(cid));
    });

    const note: NotificationInput = {
      type: "DEADLINE_REMINDER",
      title: `Deadline approaching: ${g.title} (${g.act.name})`,
      body: `The response deadline for "${g.title}" is within 48 hours. Please mark your availability.`,
      linkPath: `/acts/${g.act.slug}/bookings/${g.id}`,
    };

    await prisma.$transaction(async (tx) => {
      if (missing.length > 0) await createNotifications(tx, missing, note);
      await tx.bookingGroup.update({
        where: { id: g.id },
        data: { deadlineReminderSentAt: new Date() },
      });
    });
    if (missing.length > 0) await emailNotifications(missing, note);
  }
}
