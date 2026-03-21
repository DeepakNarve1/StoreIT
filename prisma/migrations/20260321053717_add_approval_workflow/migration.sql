-- AlterTable
ALTER TABLE "File" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalStatus" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
