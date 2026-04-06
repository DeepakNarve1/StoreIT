ALTER TABLE "File"
ADD COLUMN "activeSignatureWorkflowId" TEXT,
ADD COLUMN "currentSignatureStepOrder" INTEGER,
ADD COLUMN "signatureNote" TEXT,
ADD COLUMN "signatureStatus" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedById" TEXT;

CREATE TABLE "signature_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "mode" TEXT NOT NULL DEFAULT 'sequential',
    "currentStepOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "signature_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signature_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "signerUserId" TEXT,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "note" TEXT,
    "signatureName" TEXT,
    "signatureMethod" TEXT,
    "signatureData" JSONB,
    "accessToken" TEXT NOT NULL,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signature_action_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "File_activeSignatureWorkflowId_key" ON "File"("activeSignatureWorkflowId");
CREATE INDEX "File_tenantId_signatureStatus_idx" ON "File"("tenantId", "signatureStatus");
CREATE INDEX "signature_workflows_tenantId_fileId_createdAt_idx" ON "signature_workflows"("tenantId", "fileId", "createdAt");
CREATE INDEX "signature_workflows_tenantId_status_createdAt_idx" ON "signature_workflows"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "signature_steps_workflowId_stepOrder_key" ON "signature_steps"("workflowId", "stepOrder");
CREATE INDEX "signature_steps_tenantId_signerUserId_status_idx" ON "signature_steps"("tenantId", "signerUserId", "status");
CREATE INDEX "signature_steps_workflowId_status_idx" ON "signature_steps"("workflowId", "status");
CREATE UNIQUE INDEX "signature_steps_accessToken_key" ON "signature_steps"("accessToken");
CREATE INDEX "signature_action_logs_tenantId_workflowId_createdAt_idx" ON "signature_action_logs"("tenantId", "workflowId", "createdAt");
CREATE INDEX "signature_action_logs_tenantId_userId_createdAt_idx" ON "signature_action_logs"("tenantId", "userId", "createdAt");

ALTER TABLE "signature_workflows"
ADD CONSTRAINT "signature_workflows_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_workflows"
ADD CONSTRAINT "signature_workflows_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_workflows"
ADD CONSTRAINT "signature_workflows_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "signature_steps"
ADD CONSTRAINT "signature_steps_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_steps"
ADD CONSTRAINT "signature_steps_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "signature_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_steps"
ADD CONSTRAINT "signature_steps_signerUserId_fkey"
FOREIGN KEY ("signerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "signature_action_logs"
ADD CONSTRAINT "signature_action_logs_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_action_logs"
ADD CONSTRAINT "signature_action_logs_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "signature_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signature_action_logs"
ADD CONSTRAINT "signature_action_logs_stepId_fkey"
FOREIGN KEY ("stepId") REFERENCES "signature_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "signature_action_logs"
ADD CONSTRAINT "signature_action_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "File"
ADD CONSTRAINT "File_activeSignatureWorkflowId_fkey"
FOREIGN KEY ("activeSignatureWorkflowId") REFERENCES "signature_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "File"
ADD CONSTRAINT "File_signedById_fkey"
FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
