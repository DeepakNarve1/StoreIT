ALTER TABLE "signature_steps"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "signature_steps"
SET "expiresAt" = COALESCE("createdAt", NOW()) + INTERVAL '7 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "signature_steps"
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "signature_steps_expiresAt_idx" ON "signature_steps"("expiresAt");
