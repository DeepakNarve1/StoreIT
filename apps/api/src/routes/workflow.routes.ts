import { Router, Response } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { userHasCapability } from "./permissions.routes";
import { createAuditLog } from "../services/audit.service";
import { userCanAccessFile } from "../services/file-access.service";
import {
  approvalWorkflowInclude,
  cancelWorkflowInTransaction,
  serializeWorkflow,
} from "../services/workflow.service";

const router = Router();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (value: unknown): value is string =>
  typeof value === "string" && UUID_REGEX.test(value);

const ADMIN_ROLES = new Set(["SUPERADMIN", "ORG_ADMIN", "MANAGER"]);
const STARTABLE_ROLES = new Set([
  "SUPERADMIN",
  "ORG_ADMIN",
  "MANAGER",
  "EDITOR",
]);

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const startWorkflowSchema = z.object({
  approverUserIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  workflowMode: z.enum(["sequential", "parallel"]).optional(),
  note: z.string().max(500).optional(),
});

const workflowActionSchema = z.object({
  note: z.string().max(500).optional(),
});

async function canStartWorkflow(
  req: AuthRequest,
  file: { id: string; uploadedById: string | null },
) {
  if (STARTABLE_ROLES.has(req.user!.role)) {
    return true;
  }

  if (file.uploadedById === req.user!.userId) {
    return true;
  }

  return userHasCapability(
    req.user!.userId,
    req.user!.tenantId,
    req.user!.role,
    "file",
    file.id,
    "edit_file_attrs",
  );
}

async function loadWorkflowOrThrow(workflowId: string, tenantId: string) {
  const workflow = await prisma.approvalWorkflow.findFirst({
    where: {
      id: workflowId,
      tenantId,
    },
    include: approvalWorkflowInclude,
  });

  if (!workflow) {
    throw new HttpError(404, "Workflow not found");
  }

  return workflow;
}

router.get("/approvers", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: req.user!.tenantId,
        isActive: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    res.json({ users });
  } catch {
    res.status(500).json({ error: "Failed to load workflow approvers" });
  }
});

router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const privileged = ADMIN_ROLES.has(req.user!.role);
    const workflows = await prisma.approvalWorkflow.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(privileged
          ? {}
          : {
              OR: [
                { ownerId: req.user!.userId },
                { steps: { some: { approverUserId: req.user!.userId } } },
              ],
            }),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: approvalWorkflowInclude,
      take: privileged ? 200 : 500,
    });

    const visible = privileged
      ? workflows
      : (
          await Promise.all(
            workflows.map(async (workflow) => {
              const assignedToUser = workflow.steps.some(
                (step) => step.approverUserId === req.user!.userId,
              );
              if (assignedToUser || workflow.ownerId === req.user!.userId) {
                return workflow;
              }
              const canAccess = await userCanAccessFile(
                workflow.fileId,
                req.user!.userId,
                req.user!.tenantId,
                req.user!.role,
                // available via approvalWorkflowInclude's file selection
                (workflow as any).file?.uploadedById ?? null,
                (workflow as any).file?.folderId ?? null,
              );
              return canAccess ? workflow : null;
            }),
          )
        )
          .filter(Boolean)
          .slice(0, 200);

    res.json({
      workflows: (visible as any[]).map((workflow) =>
        serializeWorkflow(workflow, {
          userId: req.user!.userId,
          role: req.user!.role,
        }),
      ),
    });
  } catch {
    res.status(500).json({ error: "Failed to load workflows" });
  }
});

router.get("/inbox", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const steps = await prisma.approvalStep.findMany({
      where: {
        tenantId: req.user!.tenantId,
        approverUserId: req.user!.userId,
        status: "pending",
        workflow: {
          status: "in_review",
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        workflow: {
          select: {
            id: true,
            status: true,
            currentStepOrder: true,
            file: {
              select: {
                id: true,
                name: true,
                approvalStatus: true,
              },
            },
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.json({
      items: steps.map((step) => ({
        workflowId: step.workflowId,
        stepId: step.id,
        stepOrder: step.stepOrder,
        status: step.status,
        createdAt: step.createdAt,
        file: step.workflow.file,
        owner: step.workflow.owner,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to load workflow inbox" });
  }
});

router.get(
  "/files/:fileId",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.fileId)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }

    try {
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: {
          id: true,
          name: true,
          approvalStatus: true,
          activeWorkflowId: true,
          currentStepOrder: true,
          uploadedById: true,
          folderId: true,
        },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const canAccess = await userCanAccessFile(
        file.id,
        req.user!.userId,
        req.user!.tenantId,
        req.user!.role,
        file.uploadedById,
        file.folderId,
      );
      const pendingAssignedStep = await prisma.approvalStep.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          approverUserId: req.user!.userId,
          status: "pending",
          workflow: {
            fileId: file.id,
            status: "in_review",
          },
        },
        select: { id: true },
      });
      if (!canAccess && !pendingAssignedStep) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const workflow = file.activeWorkflowId
        ? await prisma.approvalWorkflow.findUnique({
            where: { id: file.activeWorkflowId },
            include: approvalWorkflowInclude,
          })
        : await prisma.approvalWorkflow.findFirst({
            where: {
              tenantId: req.user!.tenantId,
              fileId: file.id,
            },
            orderBy: { createdAt: "desc" },
            include: approvalWorkflowInclude,
          });

      res.json({
        file,
        workflow: workflow
          ? serializeWorkflow(workflow, {
              userId: req.user!.userId,
              role: req.user!.role,
            })
          : null,
      });
    } catch {
      res.status(500).json({ error: "Failed to load workflow details" });
    }
  },
);

router.post(
  "/files/:fileId/start",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.fileId)) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }

    try {
      const { approverUserIds, workflowMode, note } = startWorkflowSchema.parse(
        req.body,
      );
      const mode = workflowMode ?? "sequential";
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: {
          id: true,
          name: true,
          activeWorkflowId: true,
          approvalStatus: true,
          uploadedById: true,
          folderId: true,
        },
      });

      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      const canAccess = await userCanAccessFile(
        file.id,
        req.user!.userId,
        req.user!.tenantId,
        req.user!.role,
        file.uploadedById,
        file.folderId,
      );
      if (!canAccess) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      if (!(await canStartWorkflow(req, file))) {
        res.status(403).json({ error: "You cannot start a workflow on this file" });
        return;
      }

      const activeWorkflow = await prisma.approvalWorkflow.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          fileId: file.id,
          status: "in_review",
        },
        select: { id: true },
      });

      if (activeWorkflow || file.activeWorkflowId) {
        res.status(400).json({ error: "This file already has an active workflow" });
        return;
      }

      let orderedApproverIds = approverUserIds ?? [];
      if (orderedApproverIds.length === 0) {
        const previousWorkflow = await prisma.approvalWorkflow.findFirst({
          where: {
            tenantId: req.user!.tenantId,
            fileId: file.id,
          },
          orderBy: { createdAt: "desc" },
          include: {
            steps: {
              orderBy: { stepOrder: "asc" },
              select: { approverUserId: true },
            },
          },
        });

        if (!previousWorkflow || previousWorkflow.steps.length === 0) {
          res.status(400).json({ error: "Add at least one approver" });
          return;
        }

        orderedApproverIds = previousWorkflow.steps.map(
          (step) => step.approverUserId,
        );
      }

      if (new Set(orderedApproverIds).size !== orderedApproverIds.length) {
        res.status(400).json({ error: "Approvers must be unique in a workflow" });
        return;
      }

      const approvers = await prisma.user.findMany({
        where: {
          tenantId: req.user!.tenantId,
          isActive: true,
          id: { in: orderedApproverIds },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      if (approvers.length !== orderedApproverIds.length) {
        res.status(400).json({ error: "One or more approvers are invalid" });
        return;
      }

      const workflowId = await prisma.$transaction(async (tx) => {
        const workflowPreviewCapabilities: Record<string, boolean> = {
          // Workflow-scoped read-only share so approvers can review before acting.
          workflow_access: true,
          see_files: true,
          preview_files: true,
          download_files: false,
          edit_file_attrs: false,
          view_file_metadata: false,
          edit_file_metadata: false,
          update_versions: false,
          move_files: false,
          delete_files: false,
          share_files: false,
          share_public_link_file: false,
        };
        for (const approverUserId of orderedApproverIds) {
          const existingGrant = await tx.permission.findFirst({
            where: {
              resourceType: "file",
              resourceId: file.id,
              grantedTo: "user",
              userId: approverUserId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { id: true },
          });
          if (existingGrant) continue;
          await tx.permission.create({
            data: {
              resourceType: "file",
              resourceId: file.id,
              grantedTo: "user",
              userId: approverUserId,
              action: "read",
              capabilities: workflowPreviewCapabilities,
              fileId: file.id,
              folderId: null,
            },
          });
        }

        const workflow = await tx.approvalWorkflow.create({
          data: {
            tenantId: req.user!.tenantId,
            fileId: file.id,
            ownerId: req.user!.userId,
            status: "in_review",
            currentStepOrder: mode === "parallel" ? null : 1,
            startedAt: new Date(),
            steps: {
              create: orderedApproverIds.map((approverId, index) => ({
                tenantId: req.user!.tenantId,
                approverUserId: approverId,
                stepOrder: index + 1,
                status:
                  mode === "parallel"
                    ? "pending"
                    : index === 0
                      ? "pending"
                      : "queued",
              })),
            },
          },
          include: {
            steps: {
              orderBy: { stepOrder: "asc" },
              select: { id: true, stepOrder: true },
            },
          },
        });

        await tx.file.update({
          where: { id: file.id },
          data: {
            approvalStatus: "in_review",
            activeWorkflowId: workflow.id,
            currentStepOrder: mode === "parallel" ? null : 1,
            approvedById: null,
            approvedAt: null,
            approvalNote: null,
          },
        });

        await tx.approvalActionLog.createMany({
          data: [
            {
              tenantId: req.user!.tenantId,
              workflowId: workflow.id,
              userId: req.user!.userId,
              action: "workflow_started",
              note: note ?? null,
              metadata: { mode },
            },
            ...(mode === "parallel"
              ? workflow.steps.map((step) => ({
                  tenantId: req.user!.tenantId,
                  workflowId: workflow.id,
                  stepId: step.id,
                  userId: req.user!.userId,
                  action: "step_opened",
                  note: null,
                }))
              : [
                  {
                    tenantId: req.user!.tenantId,
                    workflowId: workflow.id,
                    stepId: workflow.steps[0]?.id ?? null,
                    userId: req.user!.userId,
                    action: "step_opened",
                    note: null,
                  },
                ]),
          ],
        });

        return workflow.id;
      });

      const workflow = await loadWorkflowOrThrow(
        workflowId,
        req.user!.tenantId,
      );

      await createAuditLog({
        action: "file.workflow.started",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: {
          approverCount: orderedApproverIds.length,
          workflowMode: mode,
        },
        req,
      });

      res.status(201).json({
        workflow: serializeWorkflow(workflow, {
          userId: req.user!.userId,
          role: req.user!.role,
        }),
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid workflow input" });
        return;
      }

      res.status(500).json({ error: "Failed to start workflow" });
    }
  },
);

async function handleWorkflowAction(
  req: AuthRequest,
  res: Response,
  action: "approve" | "reject",
) {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const { note } = workflowActionSchema.parse(req.body);
    const workflowId = await prisma.$transaction(async (tx) => {
      const workflow = await tx.approvalWorkflow.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId,
        },
        include: {
          file: {
            select: {
              id: true,
              name: true,
            },
          },
          steps: {
            orderBy: { stepOrder: "asc" },
            select: {
              id: true,
              stepOrder: true,
              approverUserId: true,
              status: true,
            },
          },
          actionLogs: {
            where: { action: "workflow_started" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { metadata: true },
          },
        },
      });

      if (!workflow) {
        throw new HttpError(404, "Workflow not found");
      }

      if (workflow.status !== "in_review") {
        throw new HttpError(400, "This workflow is no longer active");
      }

      const startedMeta = (workflow.actionLogs[0]?.metadata as any) ?? null;
      const workflowMode =
        startedMeta?.mode === "parallel" ? "parallel" : "sequential";
      const currentStep =
        workflowMode === "parallel"
          ? (workflow.steps.find(
              (step) =>
                step.status === "pending" &&
                step.approverUserId === req.user!.userId,
            ) ?? null)
          : (workflow.steps.find(
              (step) =>
                step.stepOrder === workflow.currentStepOrder &&
                step.status === "pending",
            ) ?? null);

      if (!currentStep) {
        throw new HttpError(409, "The active workflow step is stale");
      }

      if (currentStep.approverUserId !== req.user!.userId) {
        throw new HttpError(403, "Only the current approver can act");
      }

      const actedAt = new Date();
      const updatedCurrentStep = await tx.approvalStep.updateMany({
        where: {
          id: currentStep.id,
          status: "pending",
        },
        data: {
          status: action === "approve" ? "approved" : "rejected",
          note: note ?? null,
          actedAt,
        },
      });

      if (updatedCurrentStep.count !== 1) {
        throw new HttpError(409, "This approval step was already processed");
      }

      if (action === "approve" && workflowMode === "sequential") {
        const nextStep =
          workflow.steps.find(
            (step) =>
              step.stepOrder > currentStep.stepOrder && step.status === "queued",
          ) ?? null;

        if (nextStep) {
          const openedNextStep = await tx.approvalStep.updateMany({
            where: {
              id: nextStep.id,
              status: "queued",
            },
            data: { status: "pending" },
          });

          if (openedNextStep.count !== 1) {
            throw new HttpError(409, "The next workflow step is stale");
          }

          await tx.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
              currentStepOrder: nextStep.stepOrder,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              approvalStatus: "in_review",
              currentStepOrder: nextStep.stepOrder,
            },
          });

          await tx.approvalActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_approved",
                note: note ?? null,
              },
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: nextStep.id,
                userId: req.user!.userId,
                action: "step_opened",
                note: null,
              },
            ],
          });
        } else {
          await tx.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
              status: "approved",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              approvalStatus: "approved",
              activeWorkflowId: null,
              currentStepOrder: null,
              approvedById: req.user!.userId,
              approvedAt: actedAt,
              approvalNote: note ?? null,
            },
          });

          await tx.approvalActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_approved",
                note: note ?? null,
              },
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "workflow_approved",
                note: note ?? null,
              },
            ],
          });
        }
      } else if (action === "approve" && workflowMode === "parallel") {
        const remainingPending = workflow.steps.filter(
          (step) => step.status === "pending" && step.id !== currentStep.id,
        );

        if (remainingPending.length > 0) {
          await tx.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
              currentStepOrder: null,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              approvalStatus: "in_review",
              currentStepOrder: null,
            },
          });

          await tx.approvalActionLog.create({
            data: {
              tenantId: req.user!.tenantId,
              workflowId: workflow.id,
              stepId: currentStep.id,
              userId: req.user!.userId,
              action: "step_approved",
              note: note ?? null,
            },
          });
        } else {
          await tx.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
              status: "approved",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              approvalStatus: "approved",
              activeWorkflowId: null,
              currentStepOrder: null,
              approvedById: req.user!.userId,
              approvedAt: actedAt,
              approvalNote: note ?? null,
            },
          });

          await tx.approvalActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_approved",
                note: note ?? null,
              },
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "workflow_approved",
                note: note ?? null,
              },
            ],
          });
        }
      } else {
        await tx.approvalStep.updateMany({
          where: {
            workflowId: workflow.id,
            id: { not: currentStep.id },
            status: { in: ["queued", "pending"] },
          },
          data: {
            status: "skipped",
            actedAt,
          },
        });

        await tx.approvalWorkflow.update({
          where: { id: workflow.id },
          data: {
            status: "rejected",
            currentStepOrder: null,
            rejectedStepOrder: currentStep.stepOrder,
            completedAt: actedAt,
          },
        });

        await tx.file.update({
          where: { id: workflow.file.id },
          data: {
            approvalStatus: "rejected",
            activeWorkflowId: null,
            currentStepOrder: null,
            approvedById: req.user!.userId,
            approvedAt: actedAt,
            approvalNote: note ?? null,
          },
        });

        await tx.approvalActionLog.createMany({
          data: [
            {
              tenantId: req.user!.tenantId,
              workflowId: workflow.id,
              stepId: currentStep.id,
              userId: req.user!.userId,
              action: "step_rejected",
              note: note ?? null,
            },
            {
              tenantId: req.user!.tenantId,
              workflowId: workflow.id,
              stepId: currentStep.id,
              userId: req.user!.userId,
              action: "workflow_rejected",
              note: note ?? null,
            },
          ],
        });
      }

      return workflow.id;
    });

    const workflow = await loadWorkflowOrThrow(workflowId, req.user!.tenantId);
    await createAuditLog({
      action:
        action === "approve"
          ? "file.workflow.step_approved"
          : "file.workflow.rejected",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "file",
      resourceId: workflow.fileId,
      resourceName: workflow.file.name,
      metadata: {
        workflowId: workflow.id,
        note: note ?? null,
        status: workflow.status,
      },
      req,
    });

    res.json({
      workflow: serializeWorkflow(workflow, {
        userId: req.user!.userId,
        role: req.user!.role,
      }),
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }

    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid workflow action" });
      return;
    }

    res.status(500).json({ error: "Failed to update workflow" });
  }
}

router.post("/:id/approve", verifyAuth, async (req: AuthRequest, res: Response) => {
  await handleWorkflowAction(req, res, "approve");
});

router.post("/:id/reject", verifyAuth, async (req: AuthRequest, res: Response) => {
  await handleWorkflowAction(req, res, "reject");
});

router.post("/:id/cancel", verifyAuth, async (req: AuthRequest, res: Response) => {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const { note } = workflowActionSchema.parse(req.body);
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    if (workflow.status !== "in_review") {
      res.status(400).json({ error: "This workflow is no longer active" });
      return;
    }

    const canCancel =
      workflow.ownerId === req.user!.userId || ADMIN_ROLES.has(req.user!.role);
    if (!canCancel) {
      res.status(403).json({ error: "Only the owner or admin can cancel" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await cancelWorkflowInTransaction(tx, {
        workflowId: workflow.id,
        tenantId: req.user!.tenantId,
        actorUserId: req.user!.userId,
        action: "workflow_cancelled",
        note: note ?? null,
      });
    });

    const updatedWorkflow = await loadWorkflowOrThrow(
      workflow.id,
      req.user!.tenantId,
    );

    await createAuditLog({
      action: "file.workflow.cancelled",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "file",
      resourceId: workflow.file.id,
      resourceName: workflow.file.name,
      metadata: {
        workflowId: workflow.id,
        note: note ?? null,
      },
      req,
    });

    res.json({
      workflow: serializeWorkflow(updatedWorkflow, {
        userId: req.user!.userId,
        role: req.user!.role,
      }),
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid workflow action" });
      return;
    }

    res.status(500).json({ error: "Failed to cancel workflow" });
  }
});

export default router;
