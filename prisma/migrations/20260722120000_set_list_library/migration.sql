-- CreateEnum
CREATE TYPE "SetEntryKind" AS ENUM ('SONG', 'BANTER');

-- AlterTable
ALTER TABLE "song" ADD COLUMN     "album" TEXT;

-- AlterTable
ALTER TABLE "booking_group" ADD COLUMN     "setListId" TEXT;

-- CreateTable
CREATE TABLE "set_list" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_list_set" (
    "id" TEXT NOT NULL,
    "setListId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Set 1',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_list_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_entry" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "SetEntryKind" NOT NULL DEFAULT 'SONG',
    "songId" TEXT,
    "banterDescription" TEXT,
    "banterSeconds" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "set_list_actId_idx" ON "set_list"("actId");

-- CreateIndex
CREATE INDEX "set_list_set_setListId_idx" ON "set_list_set"("setListId");

-- CreateIndex
CREATE INDEX "set_entry_setId_idx" ON "set_entry"("setId");

-- CreateIndex
CREATE INDEX "set_entry_songId_idx" ON "set_entry"("songId");

-- CreateIndex
CREATE INDEX "booking_group_setListId_idx" ON "booking_group"("setListId");

-- AddForeignKey
ALTER TABLE "booking_group" ADD CONSTRAINT "booking_group_setListId_fkey" FOREIGN KEY ("setListId") REFERENCES "set_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_list" ADD CONSTRAINT "set_list_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_list" ADD CONSTRAINT "set_list_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_list_set" ADD CONSTRAINT "set_list_set_setListId_fkey" FOREIGN KEY ("setListId") REFERENCES "set_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_entry" ADD CONSTRAINT "set_entry_setId_fkey" FOREIGN KEY ("setId") REFERENCES "set_list_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_entry" ADD CONSTRAINT "set_entry_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
