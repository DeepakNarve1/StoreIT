-- Add planExpiresAt to Tenant for grace period support
ALTER TABLE "Tenant" ADD COLUMN "planExpiresAt" TIMESTAMP(3);
