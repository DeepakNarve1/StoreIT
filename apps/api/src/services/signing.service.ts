import { Prisma, type PrismaClient } from "@prisma/client";

const ADMIN_ROLES = new Set(["SUPERADMIN", "ORG_ADMIN", "MANAGER"]);

export const signatureWorkflowInclude = {
  owner: {
    select: { id: true, name: true, email: true },
  },
  file: {
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      storageKey: true,
      createdAt: true,
      signatureStatus: true,
      signatureNote: true,
      signedAt: true,
      signedBy: {
        select: {
          id: true,
          name: true,
        },
      },
      activeSignatureWorkflowId: true,
      currentSignatureStepOrder: true,
      uploadedById: true,
      folderId: true,
    },
  },
  steps: {
    orderBy: { stepOrder: "asc" as const },
    select: {
      id: true,
      workflowId: true,
      stepOrder: true,
      signerUserId: true,
      signerName: true,
      signerEmail: true,
      status: true,
      note: true,
      signatureName: true,
      signatureMethod: true,
      signatureData: true,
      accessToken: true,
      actedAt: true,
      signerUser: {
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

export type SignatureWorkflowWithRelations = Prisma.SignatureWorkflowGetPayload<{
  include: typeof signatureWorkflowInclude;
}>;

type Tx = Prisma.TransactionClient | PrismaClient;
type SignatureMode = "sequential" | "parallel";

function resolveSignatureMode(workflow: SignatureWorkflowWithRelations): SignatureMode {
  const startedLog = workflow.actionLogs.find(
    (log) => log.action === "workflow_started",
  );
  const mode = (startedLog?.metadata as any)?.mode;
  return mode === "parallel" ? "parallel" : "sequential";
}

function resolveCurrentStep(
  workflow: SignatureWorkflowWithRelations,
  mode: SignatureMode,
  userId?: string,
) {
  if (mode === "parallel") {
    if (!userId) return null;
    return (
      workflow.steps.find(
        (step) => step.status === "pending" && step.signerUserId === userId,
      ) ?? null
    );
  }

  return (
    workflow.steps.find(
      (step) =>
        step.stepOrder === workflow.currentStepOrder && step.status === "pending",
    ) ?? null
  );
}

export function serializeSignatureWorkflow(
  workflow: SignatureWorkflowWithRelations,
  currentUser?: { userId: string; role: string },
) {
  const signatureMode = resolveSignatureMode(workflow);
  const currentStep = resolveCurrentStep(
    workflow,
    signatureMode,
    currentUser?.userId,
  );
  const canCancel =
    workflow.status === "in_progress" &&
    !!currentUser &&
    (workflow.ownerId === currentUser.userId ||
      ADMIN_ROLES.has(currentUser.role));
  const canSign =
    workflow.status === "in_progress" &&
    !!currentUser &&
    (signatureMode === "parallel"
      ? workflow.steps.some(
          (step) =>
            step.status === "pending" &&
            step.signerUserId === currentUser.userId,
        )
      : currentStep?.signerUserId === currentUser.userId);

  return {
    id: workflow.id,
    fileId: workflow.fileId,
    ownerId: workflow.ownerId,
    status: workflow.status,
    currentStepOrder: workflow.currentStepOrder,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    startedAt: workflow.startedAt,
    completedAt: workflow.completedAt,
    cancelledAt: workflow.cancelledAt,
    owner: workflow.owner,
    file: workflow.file,
    signatureMode,
    currentStep,
    steps: workflow.steps,
    actionLogs: workflow.actionLogs,
    templateSignerEntries: workflow.steps.map((step) => ({
      id: step.id,
      stepOrder: step.stepOrder,
      signerUserId: step.signerUserId,
      signerName: step.signerName,
      signerEmail: step.signerEmail,
    })),
    permissions: {
      canSign,
      canCancel,
    },
  };
}

export async function cancelSignatureWorkflowInTransaction(
  tx: Tx,
  params: {
    workflowId: string;
    tenantId: string;
    actorUserId?: string | null;
    action: "workflow_cancelled" | "workflow_cancelled_for_new_version";
    note?: string | null;
  },
) {
  const workflow = await tx.signatureWorkflow.findFirst({
    where: {
      id: params.workflowId,
      tenantId: params.tenantId,
      status: "in_progress",
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

  await tx.signatureWorkflow.update({
    where: { id: workflow.id },
    data: {
      status: "cancelled",
      completedAt: new Date(),
      cancelledAt: new Date(),
      currentStepOrder: null,
    },
  });

  await tx.signatureStep.updateMany({
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
      signatureStatus: "cancelled",
      activeSignatureWorkflowId: null,
      currentSignatureStepOrder: null,
      signedById: null,
      signedAt: null,
      signatureNote: null,
    },
  });

  await tx.signatureActionLog.create({
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

export async function cancelActiveSignatureWorkflowForFile(
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
      activeSignatureWorkflowId: true,
    },
  });

  if (!file?.activeSignatureWorkflowId) {
    return null;
  }

  return cancelSignatureWorkflowInTransaction(tx, {
    workflowId: file.activeSignatureWorkflowId,
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "workflow_cancelled_for_new_version",
    note: params.note,
  });
}
