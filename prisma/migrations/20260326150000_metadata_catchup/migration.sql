-- CreateTable
CREATE TABLE "guest_access" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "capabilities" JSONB,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "fileId" TEXT,

    CONSTRAINT "guest_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_template_fields" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "metadata_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_metadata_fields" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "recursive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folder_metadata_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_access_token_key" ON "guest_access"("token");

-- CreateIndex
CREATE INDEX "guest_access_token_idx" ON "guest_access"("token");

-- CreateIndex
CREATE INDEX "guest_access_tenantId_idx" ON "guest_access"("tenantId");

-- CreateIndex
CREATE INDEX "guest_access_fileId_idx" ON "guest_access"("fileId");

-- CreateIndex
CREATE INDEX "metadata_templates_tenantId_idx" ON "metadata_templates"("tenantId");

-- CreateIndex
CREATE INDEX "metadata_template_fields_templateId_idx" ON "metadata_template_fields"("templateId");

-- CreateIndex
CREATE INDEX "folder_metadata_fields_tenantId_folderId_idx" ON "folder_metadata_fields"("tenantId", "folderId");

-- CreateIndex
CREATE INDEX "folder_metadata_fields_tenantId_key_idx" ON "folder_metadata_fields"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "guest_access" ADD CONSTRAINT "guest_access_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_access" ADD CONSTRAINT "guest_access_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_templates" ADD CONSTRAINT "metadata_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_template_fields" ADD CONSTRAINT "metadata_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "metadata_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_metadata_fields" ADD CONSTRAINT "folder_metadata_fields_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_metadata_fields" ADD CONSTRAINT "folder_metadata_fields_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
