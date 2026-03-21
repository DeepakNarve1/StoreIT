import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";
import { Request } from "express";

export type AuditAction =
  | "file.upload"
  | "file.upload.version"
  | "file.delete"
  | "file.delete.permanent"
  | "file.bulk_delete"
  | "file.bulk_move"
  | "file.download"
  | "file.view"
  | "file.restore"
  | "file.move"
  | "file.rename"
  | "file.approval.submitted"
  | "file.link.revoked"
  | "file.approval.approved"
  | "file.approval.rejected"
  | "folder.create"
  | "folder.rename"
  | "folder.delete"
  | "permission.grant"
  | "permission.revoke"
  | "link.generate"
  | "link.access"
  | "user.invite"
  | "user.login"
  | "user.logout"
  | "category.create"
  | "category.delete"
  | "superadmin.org.create"
  | "superadmin.org.update"
  | "superadmin.org.suspend"
  | "superadmin.impersonate";

interface LogParams {
  action: AuditAction;
  userId?: string | null;
  tenantId: string;
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

export const createAuditLog = async (params: LogParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId ?? null,
        resourceName: params.resourceName ?? null,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress: params.req
          ? (params.req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
            params.req.socket.remoteAddress ||
            null
          : null,
        userAgent: params.req?.headers["user-agent"] ?? null,
        userId: params.userId ?? null,
        tenantId: params.tenantId,
      },
    });
  } catch (err) {
    // Never let audit log failures break the main flow
    console.error("Audit log error:", err);
  }
};
