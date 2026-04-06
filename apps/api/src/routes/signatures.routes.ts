import { Prisma } from "@prisma/client";
import { Router, Response, Request } from "express";
import { z } from "zod";
import { verifyAuth, AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { userHasCapability } from "./permissions.routes";
import { createAuditLog } from "../services/audit.service";
import { userCanAccessFile } from "../services/file-access.service";
import {
  cancelSignatureWorkflowInTransaction,
  signatureWorkflowInclude,
  serializeSignatureWorkflow,
} from "../services/signing.service";
import { getFileViewUrl } from "../services/storage.service";
import { sendSignatureRequestEmail } from "../services/email.service";

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

const signerInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().min(1).max(120).optional(),
});

const startSignatureSchema = z.object({
  signers: z.array(signerInputSchema).min(1).max(10),
  signatureMode: z.enum(["sequential", "parallel"]).optional(),
  note: z.string().max(500).optional(),
});

const signatureActionSchema = z.object({
  note: z.string().max(500).optional(),
  signatureMethod: z.enum(["typed", "drawn"]),
  signatureName: z.string().min(1).max(120),
  signatureData: z.record(z.any()).optional(),
});

function getAppBaseUrl() {
  const raw =
    process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

async function canStartSignatureWorkflow(
  req: AuthRequest,
  file: { id: string; uploadedById: string | null },
) {
  if (STARTABLE_ROLES.has(req.user!.role)) return true;
  if (file.uploadedById === req.user!.userId) return true;

  return (
    (await userHasCapability(
      req.user!.userId,
      req.user!.tenantId,
      req.user!.role,
      "file",
      file.id,
      "request_signatures",
    )) ||
    (await userHasCapability(
      req.user!.userId,
      req.user!.tenantId,
      req.user!.role,
      "file",
      file.id,
      "edit_file_attrs",
    ))
  );
}

async function loadWorkflowOrThrow(workflowId: string, tenantId: string) {
  const workflow = await prisma.signatureWorkflow.findFirst({
    where: { id: workflowId, tenantId },
    include: signatureWorkflowInclude,
  });
  if (!workflow) {
    throw new HttpError(404, "Workflow not found");
  }
  return workflow;
}

router.get("/signers", verifyAuth, async (req: AuthRequest, res: Response) => {
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
    res.status(500).json({ error: "Failed to load signers" });
  }
});

router.get("/", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const privileged = ADMIN_ROLES.has(req.user!.role);
    const workflows = await prisma.signatureWorkflow.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(privileged
          ? {}
          : {
              OR: [
                { ownerId: req.user!.userId },
                { steps: { some: { signerUserId: req.user!.userId } } },
              ],
            }),
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: signatureWorkflowInclude,
      take: privileged ? 200 : 500,
    });

    const visible = privileged
      ? workflows
      : (
          await Promise.all(
            workflows.map(async (workflow) => {
              const assignedToUser = workflow.steps.some(
                (step) => step.signerUserId === req.user!.userId,
              );
              if (assignedToUser || workflow.ownerId === req.user!.userId) {
                return workflow;
              }
              const canAccess = await userCanAccessFile(
                workflow.fileId,
                req.user!.userId,
                req.user!.tenantId,
                req.user!.role,
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
        serializeSignatureWorkflow(workflow, {
          userId: req.user!.userId,
          role: req.user!.role,
        }),
      ),
    });
  } catch {
    res.status(500).json({ error: "Failed to load signing workflows" });
  }
});

router.get("/inbox", verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const steps = await prisma.signatureStep.findMany({
      where: {
        tenantId: req.user!.tenantId,
        signerUserId: req.user!.userId,
        status: "pending",
        workflow: {
          status: "in_progress",
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
                signatureStatus: true,
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
        signerName: step.signerName,
        signerEmail: step.signerEmail,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to load signing inbox" });
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
          signatureStatus: true,
          activeSignatureWorkflowId: true,
          currentSignatureStepOrder: true,
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
      const pendingAssignedStep = await prisma.signatureStep.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          signerUserId: req.user!.userId,
          status: "pending",
          workflow: {
            fileId: file.id,
            status: "in_progress",
          },
        },
        select: { id: true },
      });

      if (!canAccess && !pendingAssignedStep) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const workflow = file.activeSignatureWorkflowId
        ? await prisma.signatureWorkflow.findUnique({
            where: { id: file.activeSignatureWorkflowId },
            include: signatureWorkflowInclude,
          })
        : await prisma.signatureWorkflow.findFirst({
            where: {
              tenantId: req.user!.tenantId,
              fileId: file.id,
            },
            orderBy: { createdAt: "desc" },
            include: signatureWorkflowInclude,
          });

      res.json({
        file,
        workflow: workflow
          ? serializeSignatureWorkflow(workflow, {
              userId: req.user!.userId,
              role: req.user!.role,
            })
          : null,
      });
    } catch {
      res.status(500).json({ error: "Failed to load signing details" });
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
      const { signers, signatureMode, note } = startSignatureSchema.parse(
        req.body,
      );
      const mode = signatureMode ?? "sequential";
      const file = await prisma.file.findFirst({
        where: {
          id: req.params.fileId,
          tenantId: req.user!.tenantId,
          isDeleted: false,
        },
        select: {
          id: true,
          name: true,
          activeSignatureWorkflowId: true,
          signatureStatus: true,
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

      if (!(await canStartSignatureWorkflow(req, file))) {
        res
          .status(403)
          .json({ error: "You cannot start a signing workflow on this file" });
        return;
      }

      const activeWorkflow = await prisma.signatureWorkflow.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          fileId: file.id,
          status: "in_progress",
        },
        select: { id: true },
      });

      if (activeWorkflow || file.activeSignatureWorkflowId) {
        res
          .status(400)
          .json({ error: "This file already has an active signing workflow" });
        return;
      }

      const normalized = signers
        .map((signer) => ({
          userId: signer.userId ?? null,
          email: signer.email?.trim() ?? "",
          name: signer.name?.trim() ?? "",
        }))
        .filter((signer) => signer.userId || (signer.email && signer.name));

      if (normalized.length === 0) {
        res.status(400).json({ error: "Add at least one signer" });
        return;
      }

      const userIds = normalized
        .map((signer) => signer.userId)
        .filter((id): id is string => !!id);
      const users = userIds.length
        ? await prisma.user.findMany({
            where: {
              tenantId: req.user!.tenantId,
              isActive: true,
              id: { in: userIds },
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          })
        : [];

      const userById = new Map(users.map((user) => [user.id, user]));

      const deduped: Array<{
        signerUserId: string | null;
        signerName: string;
        signerEmail: string;
      }> = [];
      const seen = new Set<string>();

      for (const signer of normalized) {
        if (signer.userId) {
          const user = userById.get(signer.userId);
          if (!user) {
            res.status(400).json({ error: "One or more signers are invalid" });
            return;
          }
          if (seen.has(`user:${user.id}`)) continue;
          seen.add(`user:${user.id}`);
          deduped.push({
            signerUserId: user.id,
            signerName: user.name,
            signerEmail: user.email,
          });
          continue;
        }

        const key = `ext:${signer.email.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({
          signerUserId: null,
          signerName: signer.name,
          signerEmail: signer.email,
        });
      }

      if (deduped.length === 0) {
        res.status(400).json({ error: "Add at least one signer" });
        return;
      }

      const workflowId = await prisma.$transaction(async (tx) => {
        const workflowPreviewCapabilities: Record<string, boolean> = {
          workflow_access: true,
          see_files: true,
          preview_files: true,
          download_files: false,
          edit_file_attrs: false,
          view_metadata: false,
          edit_metadata: false,
          update_versions: false,
          move_files: false,
          delete_files: false,
          share_files: false,
          share_public_link_file: false,
          request_signatures: false,
        };

        for (const signer of deduped) {
          if (!signer.signerUserId) continue;
          const existingGrant = await tx.permission.findFirst({
            where: {
              resourceType: "file",
              resourceId: file.id,
              grantedTo: "user",
              userId: signer.signerUserId,
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
              userId: signer.signerUserId,
              action: "read",
              capabilities: workflowPreviewCapabilities,
              fileId: file.id,
              folderId: null,
            },
          });
        }

        const workflow = await tx.signatureWorkflow.create({
          data: {
            tenantId: req.user!.tenantId,
            fileId: file.id,
            ownerId: req.user!.userId,
            status: "in_progress",
            mode,
            currentStepOrder: mode === "parallel" ? null : 1,
            startedAt: new Date(),
            steps: {
              create: deduped.map((signer, index) => ({
                tenantId: req.user!.tenantId,
                signerUserId: signer.signerUserId,
                signerName: signer.signerName,
                signerEmail: signer.signerEmail,
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
              select: {
                id: true,
                stepOrder: true,
                signerUserId: true,
                signerName: true,
                signerEmail: true,
                accessToken: true,
              },
            },
          },
        });

        await tx.file.update({
          where: { id: file.id },
          data: {
            signatureStatus: "in_progress",
            activeSignatureWorkflowId: workflow.id,
            currentSignatureStepOrder: mode === "parallel" ? null : 1,
            signedById: null,
            signedAt: null,
            signatureNote: null,
          },
        });

        await tx.signatureActionLog.createMany({
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
      const baseUrl = getAppBaseUrl();
      const tenantName =
        (
          await prisma.tenant.findUnique({
            where: { id: req.user!.tenantId },
            select: { name: true },
          })
        )?.name ?? "StoreIT";
      const signerLinks = workflow.steps.map((step) => ({
        stepId: step.id,
        signerName: step.signerName,
        signerEmail: step.signerEmail,
        signUrl: `${baseUrl}/sign/${step.accessToken}`,
      }));

      const internalNotifications = workflow.steps
        .filter((step) => !!step.signerUserId)
        .map((step) => ({
          tenantId: req.user!.tenantId,
          userId: step.signerUserId!,
          type: "signature_requested",
          title: "Signature requested",
          message: `${file.name} is waiting for your signature.`,
          resourceType: "file",
          resourceId: file.id,
          link: `/browse?signFileId=${file.id}`,
          metadata: {
            workflowId: workflow.id,
            stepId: step.id,
            signerName: step.signerName,
            signatureMode: mode,
          },
        }));

      if (internalNotifications.length > 0) {
        await prisma.notification.createMany({
          data: internalNotifications,
        });
      }

      await Promise.all(
        workflow.steps.map(async (step) => {
          try {
            await sendSignatureRequestEmail({
              email: step.signerEmail,
              signerName: step.signerName,
              fileName: file.name,
              tenantName,
              signUrl: `${baseUrl}/sign/${step.accessToken}`,
              mode,
            });
          } catch (err) {
            console.error("Failed to send signature email:", err);
          }
        }),
      );

      await createAuditLog({
        action: "file.workflow.started",
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.name,
        metadata: {
          signerCount: deduped.length,
          signatureMode: mode,
        },
        req,
      });

      res.status(201).json({
        workflow: serializeSignatureWorkflow(workflow, {
          userId: req.user!.userId,
          role: req.user!.role,
        }),
        signerLinks,
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid signing input" });
        return;
      }

      res.status(500).json({ error: "Failed to start signing workflow" });
    }
  },
);

async function handleSignatureAction(
  req: AuthRequest,
  res: Response,
  action: "sign",
) {
  if (!isValidUUID(req.params.id)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const { note, signatureMethod, signatureName, signatureData } =
      signatureActionSchema.parse(req.body);
    const workflowId = await prisma.$transaction(async (tx) => {
      const workflow = await tx.signatureWorkflow.findFirst({
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
              signerUserId: true,
              signerName: true,
              signerEmail: true,
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

      if (workflow.status !== "in_progress") {
        throw new HttpError(400, "This workflow is no longer active");
      }

      const startedMeta = (workflow.actionLogs[0]?.metadata as any) ?? null;
      const workflowMode =
        startedMeta?.mode === "parallel" ? "parallel" : "sequential";
      const currentStep =
        workflowMode === "parallel"
          ? (workflow.steps.find(
              (candidate: (typeof workflow.steps)[0]) =>
                candidate.status === "pending" &&
                candidate.signerUserId === req.user!.userId,
            ) ?? null)
          : (workflow.steps.find(
              (candidate: (typeof workflow.steps)[0]) =>
                candidate.stepOrder === workflow.currentStepOrder &&
                candidate.status === "pending",
            ) ?? null);

      if (!currentStep) {
        throw new HttpError(409, "The active signing step is stale");
      }

      if (
        currentStep.signerUserId &&
        currentStep.signerUserId !== req.user!.userId
      ) {
        throw new HttpError(403, "Only the current signer can act");
      }

      const actedAt = new Date();
      const updatedCurrentStep = await tx.signatureStep.updateMany({
        where: {
          id: currentStep.id,
          status: "pending",
        },
        data: {
          status: "signed",
          note: note ?? null,
          signatureName,
          signatureMethod,
          signatureData: signatureData ?? Prisma.JsonNull,
          actedAt,
        },
      });

      if (updatedCurrentStep.count !== 1) {
        throw new HttpError(409, "This signing step was already processed");
      }

      if (workflowMode === "sequential") {
        const nextStep =
          workflow.steps.find(
            (candidate: (typeof workflow.steps)[0]) =>
              candidate.stepOrder > currentStep.stepOrder &&
              candidate.status === "queued",
          ) ?? null;

        if (nextStep) {
          const openedNextStep = await tx.signatureStep.updateMany({
            where: {
              id: nextStep.id,
              status: "queued",
            },
            data: { status: "pending" },
          });

          if (openedNextStep.count !== 1) {
            throw new HttpError(409, "The next signing step is stale");
          }

          await tx.signatureWorkflow.update({
            where: { id: workflow.id },
            data: {
              currentStepOrder: nextStep.stepOrder,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              signatureStatus: "in_progress",
              currentSignatureStepOrder: nextStep.stepOrder,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName },
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
          await tx.signatureWorkflow.update({
            where: { id: workflow.id },
            data: {
              status: "signed",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              signatureStatus: "signed",
              activeSignatureWorkflowId: null,
              currentSignatureStepOrder: null,
              signedById: currentStep.signerUserId ?? req.user!.userId,
              signedAt: actedAt,
              signatureNote: note ?? null,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName },
              },
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "workflow_completed",
                note: note ?? null,
              },
            ],
          });
        }
      } else {
        const remainingPending = workflow.steps.filter(
          (candidate: (typeof workflow.steps)[0]) =>
            candidate.status === "pending" && candidate.id !== currentStep.id,
        );

        if (remainingPending.length > 0) {
          await tx.signatureWorkflow.update({
            where: { id: workflow.id },
            data: {
              currentStepOrder: null,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              signatureStatus: "in_progress",
              currentSignatureStepOrder: null,
            },
          });

          await tx.signatureActionLog.create({
            data: {
              tenantId: req.user!.tenantId,
              workflowId: workflow.id,
              stepId: currentStep.id,
              userId: req.user!.userId,
              action: "step_signed",
              note: note ?? null,
              metadata: { signatureMethod, signatureName },
            },
          });
        } else {
          await tx.signatureWorkflow.update({
            where: { id: workflow.id },
            data: {
              status: "signed",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: workflow.file.id },
            data: {
              signatureStatus: "signed",
              activeSignatureWorkflowId: null,
              currentSignatureStepOrder: null,
              signedById: currentStep.signerUserId ?? req.user!.userId,
              signedAt: actedAt,
              signatureNote: note ?? null,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName },
              },
              {
                tenantId: req.user!.tenantId,
                workflowId: workflow.id,
                stepId: currentStep.id,
                userId: req.user!.userId,
                action: "workflow_completed",
                note: note ?? null,
              },
            ],
          });
        }
      }

      return workflow.id;
    });

    const workflow = await loadWorkflowOrThrow(workflowId, req.user!.tenantId);

    await createAuditLog({
      action: "file.workflow.step_approved",
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      resourceType: "file",
      resourceId: workflow.fileId,
      resourceName: workflow.file.name,
      metadata: {
        workflowId: workflow.id,
        note: note ?? null,
        signatureMethod,
        signatureName,
        status: workflow.status,
      },
      req,
    });

    res.json({
      workflow: serializeSignatureWorkflow(workflow, {
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
      res.status(400).json({ error: "Invalid signing action" });
      return;
    }

    res.status(500).json({ error: "Failed to update signing workflow" });
  }
}

router.post(
  "/:id/sign",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    await handleSignatureAction(req, res, "sign");
  },
);

router.post(
  "/:id/cancel",
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    if (!isValidUUID(req.params.id)) {
      res.status(400).json({ error: "Invalid workflow ID" });
      return;
    }

    try {
      const { note } = z
        .object({ note: z.string().max(500).optional() })
        .parse(req.body);
      const workflow = await prisma.signatureWorkflow.findFirst({
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

      if (workflow.status !== "in_progress") {
        res.status(400).json({ error: "This workflow is no longer active" });
        return;
      }

      const canCancel =
        workflow.ownerId === req.user!.userId ||
        ADMIN_ROLES.has(req.user!.role);
      if (!canCancel) {
        res.status(403).json({ error: "Only the owner or admin can cancel" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await cancelSignatureWorkflowInTransaction(tx, {
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
        workflow: serializeSignatureWorkflow(updatedWorkflow, {
          userId: req.user!.userId,
          role: req.user!.role,
        }),
      });
    } catch (err: any) {
      if (err.name === "ZodError") {
        res.status(400).json({ error: "Invalid signing action" });
        return;
      }

      res.status(500).json({ error: "Failed to cancel signing workflow" });
    }
  },
);

router.get("/public/:token", async (req: Request, res: Response) => {
  try {
    const step = await prisma.signatureStep.findUnique({
      where: { accessToken: req.params.token },
      include: {
        workflow: {
          include: signatureWorkflowInclude,
        },
      },
    });

    if (!step) {
      res.status(404).json({ error: "Signing link not found" });
      return;
    }

    if (step.workflow.status !== "in_progress" || step.status !== "pending") {
      res.status(403).json({ error: "This signing link is no longer active" });
      return;
    }

    const viewUrl = await getFileViewUrl(step.workflow.file.storageKey, 300);
    res.json({
      token: step.accessToken,
      step: {
        id: step.id,
        stepOrder: step.stepOrder,
        signerName: step.signerName,
        signerEmail: step.signerEmail,
        status: step.status,
        workflowId: step.workflowId,
      },
      file: {
        id: step.workflow.file.id,
        name: step.workflow.file.name,
        mimeType: step.workflow.file.mimeType,
        size: step.workflow.file.size,
        createdAt: step.workflow.file.createdAt,
        viewUrl,
      },
      workflow: serializeSignatureWorkflow(step.workflow, undefined),
    });
  } catch {
    res.status(500).json({ error: "Failed to load signing link" });
  }
});

router.post("/public/:token/sign", async (req: Request, res: Response) => {
  try {
    const { note, signatureMethod, signatureName, signatureData } =
      signatureActionSchema.parse(req.body);
    const step = await prisma.signatureStep.findUnique({
      where: { accessToken: req.params.token },
      include: {
        workflow: {
          include: {
            file: {
              select: { id: true, name: true },
            },
            steps: {
              orderBy: { stepOrder: "asc" },
              select: {
                id: true,
                stepOrder: true,
                signerUserId: true,
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
        },
      },
    });

    if (!step) {
      res.status(404).json({ error: "Signing link not found" });
      return;
    }

    if (step.status !== "pending" || step.workflow.status !== "in_progress") {
      res.status(403).json({ error: "This signing link is no longer active" });
      return;
    }

    const startedMeta = (step.workflow.actionLogs[0]?.metadata as any) ?? null;
    const workflowMode =
      startedMeta?.mode === "parallel" ? "parallel" : "sequential";
    const workflowId = await prisma.$transaction(async (tx) => {
      const currentStep = await tx.signatureStep.findFirst({
        where: {
          id: step.id,
          status: "pending",
        },
        select: {
          id: true,
          stepOrder: true,
          signerUserId: true,
        },
      });

      if (!currentStep) {
        throw new HttpError(409, "This signing step was already processed");
      }

      const actedAt = new Date();
      await tx.signatureStep.update({
        where: { id: currentStep.id },
        data: {
          status: "signed",
          note: note ?? null,
          signatureName,
          signatureMethod,
          signatureData: signatureData ?? Prisma.JsonNull,
          actedAt,
        },
      });

      if (workflowMode === "sequential") {
        const nextStep =
          step.workflow.steps.find(
            (candidate) =>
              candidate.stepOrder > currentStep.stepOrder &&
              candidate.status === "queued",
          ) ?? null;

        if (nextStep) {
          await tx.signatureStep.update({
            where: { id: nextStep.id },
            data: { status: "pending" },
          });

          await tx.signatureWorkflow.update({
            where: { id: step.workflow.id },
            data: { currentStepOrder: nextStep.stepOrder },
          });

          await tx.file.update({
            where: { id: step.workflow.file.id },
            data: {
              signatureStatus: "in_progress",
              currentSignatureStepOrder: nextStep.stepOrder,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: currentStep.id,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName, public: true },
              },
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: nextStep.id,
                action: "step_opened",
                note: null,
              },
            ],
          });
        } else {
          await tx.signatureWorkflow.update({
            where: { id: step.workflow.id },
            data: {
              status: "signed",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: step.workflow.file.id },
            data: {
              signatureStatus: "signed",
              activeSignatureWorkflowId: null,
              currentSignatureStepOrder: null,
              signedById: currentStep.signerUserId ?? null,
              signedAt: actedAt,
              signatureNote: note ?? null,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: currentStep.id,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName, public: true },
              },
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: currentStep.id,
                action: "workflow_completed",
                note: note ?? null,
              },
            ],
          });
        }
      } else {
        const remainingPending = step.workflow.steps.filter(
          (candidate) =>
            candidate.status === "pending" && candidate.id !== currentStep.id,
        );

        if (remainingPending.length > 0) {
          await tx.signatureWorkflow.update({
            where: { id: step.workflow.id },
            data: { currentStepOrder: null },
          });

          await tx.file.update({
            where: { id: step.workflow.file.id },
            data: {
              signatureStatus: "in_progress",
              currentSignatureStepOrder: null,
            },
          });

          await tx.signatureActionLog.create({
            data: {
              tenantId: step.workflow.tenantId,
              workflowId: step.workflow.id,
              stepId: currentStep.id,
              action: "step_signed",
              note: note ?? null,
              metadata: { signatureMethod, signatureName, public: true },
            },
          });
        } else {
          await tx.signatureWorkflow.update({
            where: { id: step.workflow.id },
            data: {
              status: "signed",
              currentStepOrder: null,
              completedAt: actedAt,
            },
          });

          await tx.file.update({
            where: { id: step.workflow.file.id },
            data: {
              signatureStatus: "signed",
              activeSignatureWorkflowId: null,
              currentSignatureStepOrder: null,
              signedById: currentStep.signerUserId ?? null,
              signedAt: actedAt,
              signatureNote: note ?? null,
            },
          });

          await tx.signatureActionLog.createMany({
            data: [
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: currentStep.id,
                action: "step_signed",
                note: note ?? null,
                metadata: { signatureMethod, signatureName, public: true },
              },
              {
                tenantId: step.workflow.tenantId,
                workflowId: step.workflow.id,
                stepId: currentStep.id,
                action: "workflow_completed",
                note: note ?? null,
              },
            ],
          });
        }
      }

      return step.workflow.id;
    });

    const workflow = await loadWorkflowOrThrow(
      workflowId,
      step.workflow.tenantId,
    );
    await createAuditLog({
      action: "file.workflow.step_approved",
      tenantId: step.workflow.tenantId,
      resourceType: "file",
      resourceId: step.workflow.file.id,
      resourceName: step.workflow.file.name,
      metadata: {
        workflowId: step.workflow.id,
        note: note ?? null,
        signatureMethod,
        signatureName,
        public: true,
        status: workflow.status,
      },
      req,
    });

    res.json({
      workflow: serializeSignatureWorkflow(workflow, undefined),
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }

    if (err.name === "ZodError") {
      res.status(400).json({ error: "Invalid signing action" });
      return;
    }

    res.status(500).json({ error: "Failed to sign document" });
  }
});

export default router;
