import { prisma } from "./prisma";
import { env } from "./env";
import { sendEmail } from "./email";
import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";

/**
 * Notifications (§17.3). The in-app `Notification` row is the source of truth
 * and is written inside the caller's transaction. Emails are sent best-effort
 * AFTER commit via emailNotifications() and never block anything.
 */

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body: string;
  linkPath: string;
};

type TxClient = PrismaClient | Prisma.TransactionClient;

/** Create in-app notification rows (call inside the mutation's transaction). */
export async function createNotifications(
  client: TxClient,
  userIds: string[],
  input: NotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  await client.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...input })),
  });
}

function absoluteUrl(linkPath: string): string {
  return `${env.appUrl.replace(/\/$/, "")}${linkPath}`;
}

/** Send notification emails best-effort (call AFTER the transaction commits). */
export async function emailNotifications(
  userIds: string[],
  input: NotificationInput,
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { email: true },
  });
  const url = absoluteUrl(input.linkPath);
  await Promise.all(
    users.map((u) =>
      sendEmail({
        to: u.email,
        subject: input.title,
        text: `${input.body}\n\n${url}`,
        html: `<p>${input.body}</p><p><a href="${url}">Open in Band Manager</a></p>`,
      }).catch((err) => console.error("[notify] email failed:", err)),
    ),
  );
}

/** Member user ids of an act (for broadcast notifications). */
export async function actMemberIds(
  actId: string,
  client: TxClient = prisma,
): Promise<string[]> {
  const rows = await client.actMembership.findMany({
    where: { actId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
