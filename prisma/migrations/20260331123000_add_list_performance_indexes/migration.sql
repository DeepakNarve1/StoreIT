-- Composite indexes for hot browse / list / permission lookups (PostgreSQL).

CREATE INDEX IF NOT EXISTS "Folder_tenantId_isDeleted_parentId_idx"
  ON "Folder" ("tenantId", "isDeleted", "parentId");

CREATE INDEX IF NOT EXISTS "File_tenantId_isDeleted_folderId_idx"
  ON "File" ("tenantId", "isDeleted", "folderId");

CREATE INDEX IF NOT EXISTS "File_tenantId_isDeleted_uploadedById_idx"
  ON "File" ("tenantId", "isDeleted", "uploadedById");

CREATE INDEX IF NOT EXISTS "Permission_resourceType_resourceId_idx"
  ON "Permission" ("resourceType", "resourceId");

CREATE INDEX IF NOT EXISTS "OneTimeLink_tenantId_idx"
  ON "OneTimeLink" ("tenantId");
