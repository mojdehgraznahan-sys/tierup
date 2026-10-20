-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "staffNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "learnerEmailedAt" TIMESTAMP(3),
ADD COLUMN     "tutorEmailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TutoringSession" ADD COLUMN     "meetEndedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

