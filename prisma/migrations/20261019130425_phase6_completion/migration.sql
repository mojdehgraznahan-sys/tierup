-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "stars" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TutoringSession" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledById" TEXT;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
