/*
  Warnings:

  - A unique constraint covering the columns `[songId,versionId,platform,source]` on the table `song_link` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SongResolutionStatus" AS ENUM ('UNRESOLVED', 'RESOLVED', 'MANUAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SongLinkSource" AS ENUM ('MANUAL', 'ITUNES', 'ODESLI');

-- CreateEnum
CREATE TYPE "ImportSessionStatus" AS ENUM ('DRAFT', 'RESOLVING', 'REVIEW', 'COMMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ImportLineAction" AS ENUM ('CREATE', 'LINK_EXISTING', 'SKIP', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportLineState" AS ENUM ('PENDING', 'RESOLVED', 'NO_MATCH', 'ERROR');

-- CreateEnum
CREATE TYPE "EnrichmentKind" AS ENUM ('ODESLI', 'MUSICBRAINZ');

-- CreateEnum
CREATE TYPE "EnrichmentState" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExternalProvider" AS ENUM ('ITUNES', 'ODESLI', 'MUSICBRAINZ');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SongPlatform" ADD VALUE 'TIDAL';
ALTER TYPE "SongPlatform" ADD VALUE 'DEEZER';
ALTER TYPE "SongPlatform" ADD VALUE 'AMAZON_MUSIC';
ALTER TYPE "SongPlatform" ADD VALUE 'SONGLINK';

-- AlterTable
ALTER TABLE "song" ADD COLUMN     "appleCollectionId" TEXT,
ADD COLUMN     "appleTrackId" TEXT,
ADD COLUMN     "artworkUrl" TEXT,
ADD COLUMN     "isrc" TEXT,
ADD COLUMN     "mbRecordingId" TEXT,
ADD COLUMN     "mbWorkId" TEXT,
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "releaseDate" TIMESTAMP(3),
ADD COLUMN     "resolutionStatus" "SongResolutionStatus" NOT NULL DEFAULT 'UNRESOLVED',
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "writers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "song_link" ADD COLUMN     "source" "SongLinkSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "setlist_link" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "platform" "SongPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setlist_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_import_session" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "ImportSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "rawInput" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "song_import_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_import_line" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rawLine" TEXT NOT NULL,
    "parsedTitle" TEXT,
    "parsedArtist" TEXT,
    "parsedAlbumHint" TEXT,
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "selectedCandidateIdx" INTEGER,
    "existingSongId" TEXT,
    "action" "ImportLineAction" NOT NULL DEFAULT 'CREATE',
    "state" "ImportLineState" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_import_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_job" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "kind" "EnrichmentKind" NOT NULL,
    "state" "EnrichmentState" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "enrichment_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_lookup_cache" (
    "id" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "external_lookup_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "setlist_link_setlistId_idx" ON "setlist_link"("setlistId");

-- CreateIndex
CREATE INDEX "song_import_session_actId_idx" ON "song_import_session"("actId");

-- CreateIndex
CREATE INDEX "song_import_line_sessionId_idx" ON "song_import_line"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "song_import_line_sessionId_position_key" ON "song_import_line"("sessionId", "position");

-- CreateIndex
CREATE INDEX "enrichment_job_state_runAfter_idx" ON "enrichment_job"("state", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_job_songId_kind_key" ON "enrichment_job"("songId", "kind");

-- CreateIndex
CREATE INDEX "external_lookup_cache_expiresAt_idx" ON "external_lookup_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "external_lookup_cache_provider_cacheKey_key" ON "external_lookup_cache"("provider", "cacheKey");

-- CreateIndex
CREATE INDEX "song_actId_appleTrackId_idx" ON "song"("actId", "appleTrackId");

-- CreateIndex
CREATE INDEX "song_actId_isrc_idx" ON "song"("actId", "isrc");

-- CreateIndex
CREATE UNIQUE INDEX "song_link_songId_versionId_platform_source_key" ON "song_link"("songId", "versionId", "platform", "source");

-- AddForeignKey
ALTER TABLE "setlist_link" ADD CONSTRAINT "setlist_link_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlist_link" ADD CONSTRAINT "setlist_link_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_import_session" ADD CONSTRAINT "song_import_session_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_import_session" ADD CONSTRAINT "song_import_session_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_import_line" ADD CONSTRAINT "song_import_line_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "song_import_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_import_line" ADD CONSTRAINT "song_import_line_existingSongId_fkey" FOREIGN KEY ("existingSongId") REFERENCES "song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_job" ADD CONSTRAINT "enrichment_job_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
