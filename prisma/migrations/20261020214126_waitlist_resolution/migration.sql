-- AlterTable
ALTER TABLE "SchoolWaitlist" ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SchoolWaitlist_resolvedAt_idx" ON "SchoolWaitlist"("resolvedAt");

