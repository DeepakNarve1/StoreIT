import { Prisma, type PrismaClient } from "@prisma/client";

const ADMIN_ROLES = new Set(["SUPERADMIN", "ORG_ADMIN", "MANAGER"]);

export const approvalWorkflowInclude = {
  owner: {
    select: { id: true, name: true, email: true },
  },
  file: {
    select: {
      id: true,
      name: true,
      approvalStatus: true,
      activeWorkflowId: true,
      currentStepOrder: true,
    },
  },
  steps: {
    orderBy: { stepOrder: "asc" as const },
    include: {
      approver: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
  },
  actionLogs: {
    orderBy: { createdAt: "asc" as const },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} as const;

export type WorkflowWithRelations = Prisma.ApprovalWorkflowGetPayload<{
  include: typeof approvalWorkflowInclude;
}>;

type Tx = Prisma.TransactionClient | PrismaClient;

export function serializeWorkflow(
  workflow: WorkflowWithRelations,
  currentUser: { userId: string; role: string },
) {
  const currentStep =
    workflow.status === "in_review"
      ? (workflow.steps.find(
          (step) =>
            step.stepOrder === workflow.currentStepOrder &&
            step.status === "pending",
        ) ?? null)
      : null;
  const canCancel =
    workflow.status === "in_review" &&
    (workflow.ownerId === currentUser.userId ||
      ADMIN_ROLES.has(currentUser.role));
  const canAct =
    currentStep?.approverUserId === currentUser.userId &&
    workflow.status === "in_review";

  return {
    id: workflow.id,
    fileId: workflow.fileId,
    ownerId: workflow.ownerId,
    status: workflow.status,
    currentStepOrder: workflow.currentStepOrder,
    rejectedStepOrder: workflow.rejectedStepOrder,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    startedAt: workflow.startedAt,
    completedAt: workflow.completedAt,
    cancelledAt: workflow.cancelledAt,
    owner: workflow.owner,
    file: workflow.file,
    currentStep,
    steps: workflow.steps,
    actionLogs: workflow.actionLogs,
    templateApproverUserIds: workflow.steps
      .map((step) => step.approverUserId)
      .filter((id) => id !== null),
    permissions: {
      canApprove: canAct,
      canReject: canAct,
      canCancel,
    },
  };
}

export async function cancelWorkflowInTransaction(
  tx: Tx,
  params: {
    workflowId: string;
    tenantId: string;
    actorUserId?: string | null;
    action: "workflow_cancelled" | "workflow_cancelled_for_new_version";
    note?: string | null;
  },
) {
  const workflow = await tx.approvalWorkflow.findFirst({
    where: {
      id: params.workflowId,
      tenantId: params.tenantId,
      status: "in_review",
    },
    include: {
      file: {
        select: {
          id: true,
          name: true,
        },
      },
      steps: {
        select: {
          id: true,
          status: true,
          stepOrder: true,
        },
      },
    },
  });

  if (!workflow) {
    return null;
  }

  const currentStep = workflow.steps.find(
    (step) =>
      step.stepOrder === workflow.currentStepOrder && step.status === "pending",
  );

  await tx.approvalWorkflow.update({
    where: { id: workflow.id },
    data: {
      status: "cancelled",
      completedAt: new Date(),
      cancelledAt: new Date(),
      currentStepOrder: null,
    },
  });

  await tx.approvalStep.updateMany({
    where: {
      workflowId: workflow.id,
      status: { in: ["queued", "pending"] },
    },
    data: {
      status: "cancelled",
      actedAt: new Date(),
    },
  });

  await tx.file.update({
    where: { id: workflow.fileId },
    data: {
      approvalStatus: "draft",
      activeWorkflowId: null,
      currentStepOrder: null,
      approvedById: null,
      approvedAt: null,
      approvalNote: null,
    },
  });

  await tx.approvalActionLog.create({
    data: {
      tenantId: params.tenantId,
      workflowId: workflow.id,
      stepId: currentStep?.id ?? null,
      userId: params.actorUserId ?? null,
      action: params.action,
      note: params.note ?? null,
    },
  });

  return workflow;
}

export async function cancelActiveWorkflowForFile(
  tx: Tx,
  params: {
    fileId: string;
    tenantId: string;
    actorUserId?: string | null;
    note?: string | null;
  },
) {
  const file = await tx.file.findFirst({
    where: {
      id: params.fileId,
      tenantId: params.tenantId,
    },
    select: {
      activeWorkflowId: true,
    },
  });

  if (!file?.activeWorkflowId) {
    return null;
  }

  return cancelWorkflowInTransaction(tx, {
    workflowId: file.activeWorkflowId,
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "workflow_cancelled_for_new_version",
    note: params.note,
  });
}
