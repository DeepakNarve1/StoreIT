-- Full-text search: store extracted document text + PostgreSQL GIN index for to_tsvector queries
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "searchText" TEXT;
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "searchIndexedAt" TIMESTAMP(3);

-- Accelerate @@ websearch_to_tsquery / plainto_tsquery against English tokens
CREATE INDEX IF NOT EXISTS "File_searchText_fts_idx"
  ON "File" USING gin (to_tsvector('english', coalesce("searchText", '')));
