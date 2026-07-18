-- CreateTable
CREATE TABLE "act_disabled_event_type" (
    "id" TEXT NOT NULL,
    "actId" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "act_disabled_event_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "act_disabled_event_type_actId_idx" ON "act_disabled_event_type"("actId");

-- CreateIndex
CREATE UNIQUE INDEX "act_disabled_event_type_actId_eventTypeId_key" ON "act_disabled_event_type"("actId", "eventTypeId");

-- AddForeignKey
ALTER TABLE "act_disabled_event_type" ADD CONSTRAINT "act_disabled_event_type_actId_fkey" FOREIGN KEY ("actId") REFERENCES "act"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "act_disabled_event_type" ADD CONSTRAINT "act_disabled_event_type_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
