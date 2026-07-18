-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvailabilityAnswer" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE', 'MAYBE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_POLL', 'NUDGE', 'DEADLINE_REMINDER', 'DATE_CONFIRMED', 'ENTRY_CHANGED', 'BOOKING_CANCELLED');

-- AlterTable
ALTER TABLE "calendar_entry" ADD COLUMN     "bookingGroupId" TEXT,
ADD COLUMN     "status" "EntryStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "booking_group" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerName" TEXT,
    "customerContact" TEXT,
    "venueNotes" TEXT,
    "responseDeadline" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "confirmedEntryId" TEXT,
    "deadlineReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_response" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "AvailabilityAnswer" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_acknowledgement" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versionAtAck" INTEGER NOT NULL,

    CONSTRAINT "entry_acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_change_log" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "entry_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkPath" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_feed_token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_feed_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_group_confirmedEntryId_key" ON "booking_group"("confirmedEntryId");

-- CreateIndex
CREATE INDEX "booking_group_actId_idx" ON "booking_group"("actId");

-- CreateIndex
CREATE INDEX "availability_response_userId_idx" ON "availability_response"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "availability_response_entryId_userId_key" ON "availability_response"("entryId", "userId");

-- CreateIndex
CREATE INDEX "entry_acknowledgement_userId_idx" ON "entry_acknowledgement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "entry_acknowledgement_entryId_userId_key" ON "entry_acknowledgement"("entryId", "userId");

-- CreateIndex
CREATE INDEX "entry_change_log_entryId_idx" ON "entry_change_log"("entryId");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_token_userId_key" ON "calendar_feed_token"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_token_tokenHash_key" ON "calendar_feed_token"("tokenHash");

-- CreateIndex
CREATE INDEX "calendar_entry_bookingGroupId_idx" ON "calendar_entry"("bookingGroupId");

-- AddForeignKey
ALTER TABLE "calendar_entry" ADD CONSTRAINT "calendar_entry_bookingGroupId_fkey" FOREIGN KEY ("bookingGroupId") REFERENCES "booking_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_group" ADD CONSTRAINT "booking_group_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_group" ADD CONSTRAINT "booking_group_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_group" ADD CONSTRAINT "booking_group_confirmedEntryId_fkey" FOREIGN KEY ("confirmedEntryId") REFERENCES "calendar_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_response" ADD CONSTRAINT "availability_response_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_response" ADD CONSTRAINT "availability_response_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_acknowledgement" ADD CONSTRAINT "entry_acknowledgement_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_acknowledgement" ADD CONSTRAINT "entry_acknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_change_log" ADD CONSTRAINT "entry_change_log_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_change_log" ADD CONSTRAINT "entry_change_log_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feed_token" ADD CONSTRAINT "calendar_feed_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
