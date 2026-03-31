-- Enforce one metadata field definition per (folderId, key) and one value row per (fileId, key).
-- Deduplicate first: keep the newest row per (folderId, key) / (fileId, key).

DELETE FROM "folder_metadata_fields"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "folderId", key
             ORDER BY "createdAt" DESC, id DESC
           ) AS rn
    FROM "folder_metadata_fields"
  ) sub
  WHERE rn > 1
);

DELETE FROM "file_metadata"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY "fileId", key
             ORDER BY "createdAt" DESC, id DESC
           ) AS rn
    FROM "file_metadata"
  ) sub
  WHERE rn > 1
);

-- Unique indexes (matches Prisma @@unique)
CREATE UNIQUE INDEX "folder_metadata_fields_folderId_key_key" ON "folder_metadata_fields"("folderId", key);

CREATE UNIQUE INDEX "file_metadata_fileId_key_key" ON "file_metadata"("fileId", key);
