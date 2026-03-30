ALTER TABLE "File"
ADD COLUMN "activeWorkflowId" TEXT,
ADD COLUMN "currentStepOrder" INTEGER;

CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currentStepOrder" INTEGER,
    "rejectedStepOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "note" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_action_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stepId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "File_activeWorkflowId_key" ON "File"("activeWorkflowId");
CREATE INDEX "File_tenantId_approvalStatus_idx" ON "File"("tenantId", "approvalStatus");
CREATE INDEX "approval_workflows_tenantId_fileId_createdAt_idx" ON "approval_workflows"("tenantId", "fileId", "createdAt");
CREATE INDEX "approval_workflows_tenantId_status_createdAt_idx" ON "approval_workflows"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "approval_steps_workflowId_stepOrder_key" ON "approval_steps"("workflowId", "stepOrder");
CREATE INDEX "approval_steps_tenantId_approverUserId_status_idx" ON "approval_steps"("tenantId", "approverUserId", "status");
CREATE INDEX "approval_steps_workflowId_status_idx" ON "approval_steps"("workflowId", "status");
CREATE INDEX "approval_action_logs_tenantId_workflowId_createdAt_idx" ON "approval_action_logs"("tenantId", "workflowId", "createdAt");
CREATE INDEX "approval_action_logs_tenantId_userId_createdAt_idx" ON "approval_action_logs"("tenantId", "userId", "createdAt");

ALTER TABLE "approval_workflows"
ADD CONSTRAINT "approval_workflows_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_workflows"
ADD CONSTRAINT "approval_workflows_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_workflows"
ADD CONSTRAINT "approval_workflows_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
ADD CONSTRAINT "approval_steps_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
ADD CONSTRAINT "approval_steps_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_steps"
ADD CONSTRAINT "approval_steps_approverUserId_fkey"
FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_action_logs"
ADD CONSTRAINT "approval_action_logs_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_action_logs"
ADD CONSTRAINT "approval_action_logs_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_action_logs"
ADD CONSTRAINT "approval_action_logs_stepId_fkey"
FOREIGN KEY ("stepId") REFERENCES "approval_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "approval_action_logs"
ADD CONSTRAINT "approval_action_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "File"
ADD CONSTRAINT "File_activeWorkflowId_fkey"
FOREIGN KEY ("activeWorkflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
