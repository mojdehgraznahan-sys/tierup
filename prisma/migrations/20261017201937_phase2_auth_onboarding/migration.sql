-- AlterTable
ALTER TABLE "HelpRequest" ALTER COLUMN "formats" SET DEFAULT ARRAY[]::"Format"[];

-- AlterTable
ALTER TABLE "ParentConsent" ADD COLUMN     "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "actions" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "staffEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "approvedSpaces" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SchoolWaitlist" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'student';

-- AlterTable
ALTER TABLE "TutorSubject" ADD COLUMN     "endorserEmail" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availabilityBlocks" "TimeBlock"[] DEFAULT ARRAY[]::"TimeBlock"[],
ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"Role"[],
ALTER COLUMN "formats" SET DEFAULT ARRAY[]::"Format"[];
