-- AlterEnum
ALTER TYPE "ImportLineAction" ADD VALUE 'NEW_VERSION';

-- AlterTable
ALTER TABLE "set_entry" ADD COLUMN     "songVersionId" TEXT;

-- AlterTable
ALTER TABLE "song_import_session" ADD COLUMN     "targetSetId" TEXT;

-- CreateIndex
CREATE INDEX "set_entry_songVersionId_idx" ON "set_entry"("songVersionId");

-- CreateIndex
CREATE INDEX "song_import_session_targetSetId_idx" ON "song_import_session"("targetSetId");

-- AddForeignKey
ALTER TABLE "set_entry" ADD CONSTRAINT "set_entry_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "song_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_import_session" ADD CONSTRAINT "song_import_session_targetSetId_fkey" FOREIGN KEY ("targetSetId") REFERENCES "set_list_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;
