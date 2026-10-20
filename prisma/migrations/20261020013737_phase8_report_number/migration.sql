-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Report_number_key" ON "Report"("number");

