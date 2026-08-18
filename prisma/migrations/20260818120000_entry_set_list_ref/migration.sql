-- AlterTable
ALTER TABLE "calendar_entry" ADD COLUMN     "setListId" TEXT;

-- CreateIndex
CREATE INDEX "calendar_entry_setListId_idx" ON "calendar_entry"("setListId");

-- AddForeignKey
ALTER TABLE "calendar_entry" ADD CONSTRAINT "calendar_entry_setListId_fkey" FOREIGN KEY ("setListId") REFERENCES "set_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;
