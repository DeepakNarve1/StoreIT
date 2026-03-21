-- CreateTable
CREATE TABLE "FileComment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileComment_fileId_idx" ON "FileComment"("fileId");

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
