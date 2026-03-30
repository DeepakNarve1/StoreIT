/** Response from POST /workflow/files/:id/start */
export type StartedApprovalWorkflow = {
  id: string;
  status?: string;
  fileId?: string;
  currentStepOrder?: number | null;
  file?: {
    approvalStatus?: string | null;
    currentStepOrder?: number | null;
  } | null;
};

export type WorkflowPermissions = {
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
};

export type WorkflowStep = {
  id?: string;
  status?: string;
  order?: number;
  approver?: { id?: string; name?: string; email?: string } | null;
};

export type WorkflowFileSnapshot = {
  id: string;
  name?: string;
  approvalStatus?: string | null;
  currentStepOrder?: number | null;
};

export type WorkflowStepRow = {
  id: string;
  stepOrder: number;
  status: string;
  note?: string | null;
  approver?: { name?: string; email?: string } | null;
};

export type WorkflowActionLog = {
  id: string;
  action: string;
  createdAt: string;
  note?: string | null;
  user?: { name?: string } | null;
};

export type WorkflowWithFile = StartedApprovalWorkflow & {
  owner?: { name?: string } | null;
  templateApproverUserIds?: string[];
  currentStep?: WorkflowStep | null;
  permissions?: WorkflowPermissions;
  file?: WorkflowFileSnapshot | null;
  steps: WorkflowStepRow[];
  actionLogs: WorkflowActionLog[];
};

export type FileWorkflowEnvelope = {
  workflow: WorkflowWithFile | null;
  file: WorkflowFileSnapshot;
};

export type WorkflowListItem = {
  id: string;
  status: string;
  updatedAt?: string;
  file?: { id: string; name: string } | null;
  owner?: { name?: string } | null;
  currentStep?: { approver?: { name?: string } | null } | null;
  steps?: unknown[];
};
