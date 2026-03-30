import { prisma } from "../utils/prisma";
import { getEffectiveRoleProfileForUser } from "./role-profiles.service";

/** Whether the user may see / act on this file (tenant, role profile, grants, folder inherit). */
export async function userCanAccessFile(
  fileId: string,
  userId: string,
  tenantId: string,
  role: string,
  uploadedById: string | null,
  folderId?: string | null,
): Promise<boolean> {
  const roleContext = await getEffectiveRoleProfileForUser(userId);
  if (
    roleContext &&
    roleContext.tenantId === tenantId &&
    roleContext.baseRole !== "VIEWER" &&
    roleContext.capabilities.see_files
  ) {
    return true;
  }
  if (uploadedById === userId) return true;

  const fileOrClauses: Array<
    | { grantedTo: string }
    | { grantedTo: string; userId: string }
    | { grantedTo: string; departmentId: string }
  > = [{ grantedTo: "all" }, { grantedTo: "user", userId }];
  if (roleContext?.departmentId) {
    fileOrClauses.push({
      grantedTo: "department",
      departmentId: roleContext.departmentId,
    });
  }

  const filePerm = await prisma.permission.findFirst({
    where: {
      resourceType: "file",
      resourceId: fileId,
      OR: fileOrClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
  });
  if (filePerm) return true;

  if (folderId) {
    const folderPerm = await prisma.permission.findFirst({
      where: {
        resourceType: "folder",
        resourceId: folderId,
        OR: fileOrClauses,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { folder: { tenantId } },
        ],
      },
    });
    if (folderPerm) return true;
  }

  return false;
}

/** Coarse action level on a file (grant rows + role profile). */
export async function userHasFilePermission(
  fileId: string,
  userId: string,
  uploadedById: string | null,
  role: string,
  requiredAction: "write" | "delete" | "admin",
): Promise<boolean> {
  const roleContext = await getEffectiveRoleProfileForUser(userId);
  const allowByRoleProfile =
    roleContext?.baseRole === "SUPERADMIN" ||
    (roleContext?.baseRole !== "VIEWER" &&
      ((requiredAction === "write" &&
        (roleContext?.capabilities.edit_file_attrs ||
          roleContext?.capabilities.edit_online ||
          roleContext?.capabilities.update_versions ||
          roleContext?.capabilities.move_files ||
          roleContext?.capabilities.edit_metadata)) ||
        (requiredAction === "delete" && roleContext?.capabilities.delete_files) ||
        (requiredAction === "admin" &&
          (roleContext?.capabilities.share_files ||
            roleContext?.capabilities.share_public_link_file ||
            roleContext?.capabilities.see_audit_trails_file))));
  if (allowByRoleProfile) return true;
  if (uploadedById === userId) return true;

  const actionRank: Record<string, number> = {
    read: 1,
    write: 2,
    delete: 3,
    admin: 4,
  };
  const required = actionRank[requiredAction];

  const permOrClauses: Array<
    | { grantedTo: string }
    | { grantedTo: string; userId: string }
    | { grantedTo: string; departmentId: string }
  > = [{ grantedTo: "all" }, { grantedTo: "user", userId }];
  if (roleContext?.departmentId) {
    permOrClauses.push({
      grantedTo: "department",
      departmentId: roleContext.departmentId,
    });
  }

  const perm = await prisma.permission.findFirst({
    where: {
      resourceType: "file",
      resourceId: fileId,
      fileId,
      OR: permOrClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
  });

  if (!perm) return false;
  return (actionRank[perm.action] ?? 0) >= required;
}
