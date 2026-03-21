/*
  Warnings:

  - You are about to drop the `FileMetadata` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FileComment" DROP CONSTRAINT "FileComment_fileId_fkey";

-- DropForeignKey
ALTER TABLE "FileMetadata" DROP CONSTRAINT "FileMetadata_fileId_fkey";

-- DropTable
DROP TABLE "FileMetadata";

-- CreateTable
CREATE TABLE "file_metadata" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_metadata_fileId_idx" ON "file_metadata"("fileId");

-- AddForeignKey
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
