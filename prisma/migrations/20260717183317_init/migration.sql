-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPERADMIN', 'USER');

-- CreateEnum
CREATE TYPE "ActRole" AS ENUM ('ADMIN', 'MEMBER', 'READONLY');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "SongStatus" AS ENUM ('IDEA', 'REHEARSING', 'REHEARSED', 'PERFORMED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SongPlatform" AS ENUM ('SPOTIFY', 'YOUTUBE', 'APPLE_MUSIC', 'SOUNDCLOUD', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarKind" AS ENUM ('REHEARSAL', 'EVENT');

-- CreateEnum
CREATE TYPE "FileEntityType" AS ENUM ('SONG', 'SONG_VERSION', 'CALENDAR_ENTRY');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('LEAD_SHEET', 'LYRICS', 'ATTACHMENT', 'OTHER');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "globalRole" "GlobalRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillLevel" "SkillLevel",
    "equipment" JSONB NOT NULL DEFAULT '[]',
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "act" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "act_membership" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ActRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "act_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "grants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "style" TEXT,
    "key" TEXT,
    "tempoBpm" INTEGER,
    "durationSec" INTEGER,
    "lyrics" TEXT,
    "notes" TEXT,
    "status" "SongStatus" NOT NULL DEFAULT 'IDEA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_link" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "versionId" TEXT,
    "platform" "SongPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_version" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_song_status" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "rehearsed" BOOLEAN NOT NULL DEFAULT false,
    "rehearsedAt" TIMESTAMP(3),
    "performedCount" INTEGER NOT NULL DEFAULT 0,
    "lastPerformedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_song_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_type" (
    "id" TEXT NOT NULL,
    "actId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_status" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_status_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "calendar_entry" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "kind" "CalendarKind" NOT NULL,
    "eventTypeId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "locationName" TEXT,
    "locationAddress" TEXT,
    "locationUrl" TEXT,
    "loadInAt" TIMESTAMP(3),
    "soundcheckAt" TIMESTAMP(3),
    "downbeatAt" TIMESTAMP(3),
    "loadOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statusKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setlist" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Set 1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setlist_item" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "songId" TEXT NOT NULL,
    "songVersionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_asset" (
    "id" TEXT NOT NULL,
    "entityType" "FileEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL DEFAULT 'ATTACHMENT',
    "actId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStartsAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_userId_key" ON "user_profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "act_slug_key" ON "act"("slug");

-- CreateIndex
CREATE INDEX "act_membership_userId_idx" ON "act_membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "act_membership_actId_userId_key" ON "act_membership"("actId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "song_actId_idx" ON "song"("actId");

-- CreateIndex
CREATE INDEX "song_link_songId_idx" ON "song_link"("songId");

-- CreateIndex
CREATE INDEX "song_version_songId_idx" ON "song_version"("songId");

-- CreateIndex
CREATE INDEX "user_song_status_songId_idx" ON "user_song_status"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "user_song_status_userId_songId_key" ON "user_song_status"("userId", "songId");

-- CreateIndex
CREATE INDEX "event_type_actId_idx" ON "event_type"("actId");

-- CreateIndex
CREATE INDEX "calendar_entry_actId_idx" ON "calendar_entry"("actId");

-- CreateIndex
CREATE INDEX "calendar_entry_startsAt_idx" ON "calendar_entry"("startsAt");

-- CreateIndex
CREATE INDEX "attendance_userId_idx" ON "attendance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entryId_userId_key" ON "attendance"("entryId", "userId");

-- CreateIndex
CREATE INDEX "setlist_entryId_idx" ON "setlist"("entryId");

-- CreateIndex
CREATE INDEX "setlist_item_setlistId_idx" ON "setlist_item"("setlistId");

-- CreateIndex
CREATE INDEX "setlist_item_songId_idx" ON "setlist_item"("songId");

-- CreateIndex
CREATE INDEX "file_asset_entityType_entityId_idx" ON "file_asset"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "file_asset_actId_idx" ON "file_asset"("actId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_bucket_key_key" ON "rate_limit_bucket"("key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "act" ADD CONSTRAINT "act_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "act_membership" ADD CONSTRAINT "act_membership_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "act_membership" ADD CONSTRAINT "act_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song" ADD CONSTRAINT "song_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_link" ADD CONSTRAINT "song_link_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_link" ADD CONSTRAINT "song_link_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "song_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_version" ADD CONSTRAINT "song_version_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_song_status" ADD CONSTRAINT "user_song_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_song_status" ADD CONSTRAINT "user_song_status_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entry" ADD CONSTRAINT "calendar_entry_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entry" ADD CONSTRAINT "calendar_entry_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entry" ADD CONSTRAINT "calendar_entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_statusKey_fkey" FOREIGN KEY ("statusKey") REFERENCES "attendance_status"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlist" ADD CONSTRAINT "setlist_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "calendar_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlist_item" ADD CONSTRAINT "setlist_item_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlist_item" ADD CONSTRAINT "setlist_item_songId_fkey" FOREIGN KEY ("songId") REFERENCES "song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setlist_item" ADD CONSTRAINT "setlist_item_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "song_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
