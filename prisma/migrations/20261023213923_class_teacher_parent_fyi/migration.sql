-- AlterTable
ALTER TABLE "LearnerSubject" ADD COLUMN     "className" TEXT,
ADD COLUMN     "teacherEmail" TEXT,
ADD COLUMN     "teacherName" TEXT;

-- AlterTable
ALTER TABLE "SessionSummary" ADD COLUMN     "teacherDigestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "parentEmail" TEXT,
ADD COLUMN     "parentOptOutToken" TEXT,
ADD COLUMN     "parentSummariesOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_parentOptOutToken_key" ON "User"("parentOptOutToken");

