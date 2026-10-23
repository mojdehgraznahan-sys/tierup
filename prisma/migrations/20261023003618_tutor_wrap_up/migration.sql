-- AlterTable
ALTER TABLE "TutoringSession" ADD COLUMN     "learnerShowedUp" BOOLEAN,
ADD COLUMN     "tutorFeedback" TEXT,
ADD COLUMN     "tutorWrappedUpAt" TIMESTAMP(3);
