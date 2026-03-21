-- AlterTable
ALTER TABLE "File" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
