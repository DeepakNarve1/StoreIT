-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "departmentId" TEXT;

-- CreateIndex
CREATE INDEX "Permission_departmentId_idx" ON "Permission"("departmentId");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
