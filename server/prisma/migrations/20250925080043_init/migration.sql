-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" TEXT NOT NULL,
    "readId" TEXT NOT NULL,
    "editTokenHash" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '無題プラン',
    "planJson" JSONB NOT NULL,
    "meta" JSONB,
    "ownerId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_readId_key" ON "public"."Plan"("readId");

-- CreateIndex
CREATE INDEX "Plan_ownerId_createdAt_idx" ON "public"."Plan"("ownerId", "createdAt");
