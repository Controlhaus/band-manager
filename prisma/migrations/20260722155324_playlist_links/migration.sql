-- CreateTable
CREATE TABLE "set_list_link" (
    "id" TEXT NOT NULL,
    "setListId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_list_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "set_link" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "set_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "set_list_link_setListId_idx" ON "set_list_link"("setListId");

-- CreateIndex
CREATE INDEX "set_link_setId_idx" ON "set_link"("setId");

-- AddForeignKey
ALTER TABLE "set_list_link" ADD CONSTRAINT "set_list_link_setListId_fkey" FOREIGN KEY ("setListId") REFERENCES "set_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "set_link" ADD CONSTRAINT "set_link_setId_fkey" FOREIGN KEY ("setId") REFERENCES "set_list_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
