CREATE TABLE "role_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "Role" NOT NULL,
    "systemKey" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "roleProfileId" TEXT;
ALTER TABLE "InviteToken" ADD COLUMN "roleProfileId" TEXT;

CREATE UNIQUE INDEX "role_profiles_tenantId_name_key" ON "role_profiles"("tenantId", "name");
CREATE UNIQUE INDEX "role_profiles_tenantId_systemKey_key" ON "role_profiles"("tenantId", "systemKey");
CREATE INDEX "role_profiles_tenantId_baseRole_idx" ON "role_profiles"("tenantId", "baseRole");
CREATE INDEX "User_tenantId_roleProfileId_idx" ON "User"("tenantId", "roleProfileId");
CREATE INDEX "InviteToken_tenantId_roleProfileId_idx" ON "InviteToken"("tenantId", "roleProfileId");

ALTER TABLE "role_profiles"
ADD CONSTRAINT "role_profiles_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_roleProfileId_fkey"
FOREIGN KEY ("roleProfileId") REFERENCES "role_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InviteToken"
ADD CONSTRAINT "InviteToken_roleProfileId_fkey"
FOREIGN KEY ("roleProfileId") REFERENCES "role_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
