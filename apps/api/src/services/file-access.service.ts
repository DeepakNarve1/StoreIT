import { prisma } from "../utils/prisma";
import { getEffectiveRoleProfileForUser } from "./role-profiles.service";

function permissionPriority(grantedTo: string): number {
  if (grantedTo === "user") return 3;
  if (grantedTo === "department") return 2;
  if (grantedTo === "all") return 1;
  return 0;
}

function pickHighestPriorityPermission<T extends { grantedTo: string }>(
  permissions: T[],
): T | null {
  if (permissions.length === 0) return null;
  return permissions.reduce((best, current) => {
    if (!best) return current;
    const bestPriority = permissionPriority(best.grantedTo);
    const currentPriority = permissionPriority(current.grantedTo);
    if (currentPriority > bestPriority) return current;
    return best;
  }, permissions[0] as T | null);
}

async function getAncestorChainForFolder(
  tenantId: string,
  startFolderId: string,
  maxDepth = 80,
): Promise<string[]> {
  const rows = await prisma.folder.findMany({
    where: { tenantId, isDeleted: false },
    select: { id: true, parentId: true },
  });
  const parentById = new Map<string, string | null>(
    rows.map((r) => [r.id, r.parentId]),
  );
  const chain: string[] = [];
  let current: string | null = startFolderId;
  let depth = 0;
  while (current && depth < maxDepth) {
    chain.push(current);
    current = parentById.get(current) ?? null;
    depth++;
  }
  return chain;
}

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
  if (roleContext && roleContext.tenantId !== tenantId) return false;
  if (
    roleContext &&
    roleContext.tenantId === tenantId &&
    roleContext.baseRole !== "VIEWER" &&
    roleContext.capabilities.see_files
  ) {
    return true;
  }
  if (uploadedById === userId) {
    // Ensure the file is actually in this tenant (defense-in-depth).
    const exists = await prisma.file.findFirst({
      where: { id: fileId, tenantId, isDeleted: false },
      select: { id: true },
    });
    if (exists) return true;
  }

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
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { file: { tenantId } },
      ],
    },
  });
  if (filePerm) return true;

  if (folderId) {
    // Allow access via:
    // - direct permission on the file's folder, OR
    // - an ancestor folder permission that has apply_subfolders enabled.
    const chain = await getAncestorChainForFolder(tenantId, folderId, 80);

    const folderPerms = await prisma.permission.findMany({
      where: {
        resourceType: "folder",
        resourceId: { in: chain },
        OR: fileOrClauses,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          { folder: { tenantId } },
        ],
      },
      select: { resourceId: true, capabilities: true, action: true },
    });

    for (const p of folderPerms) {
      if (p.resourceId === folderId) return true;
      const caps = (p as any).capabilities as Record<string, boolean> | null;
      if (caps?.apply_subfolders === true) return true;
    }
  }

  return false;
}

/**
 * Checks a granular capability for a file, resolving both:
 * - direct file permission grants, and
 * - folder grants on the file's containing folder (common for VIEWER sharing).
 *
 * Note: folder permission records may carry file-related capability keys (like preview_files)
 * because the UI stores a single capabilities map for both resource types.
 */
export async function userHasResolvedFileCapability(opts: {
  userId: string;
  tenantId: string;
  fileId: string;
  folderId?: string | null;
  uploadedById?: string | null;
  capability: string;
}): Promise<boolean> {
  const { userId, tenantId, fileId, folderId, uploadedById, capability } = opts;
  const roleContext = await getEffectiveRoleProfileForUser(userId);
  if (!roleContext || roleContext.tenantId !== tenantId) return false;

  // Non-viewers can rely on role profile capabilities for tenant-wide access.
  if (roleContext.baseRole !== "VIEWER" && roleContext.capabilities[capability] === true) {
    return true;
  }

  // File owner always has full self-access for common read operations.
  if (uploadedById && uploadedById === userId) return true;

  const orClauses: Array<
    | { grantedTo: string }
    | { grantedTo: string; userId: string }
    | { grantedTo: string; departmentId: string }
  > = [{ grantedTo: "all" }, { grantedTo: "user", userId }];
  if (roleContext.departmentId) {
    orClauses.push({
      grantedTo: "department",
      departmentId: roleContext.departmentId,
    });
  }

  const readByAction = (action: string | null | undefined): boolean => {
    // For file viewing, treat any coarse grant as allowing preview unless explicitly disabled via capabilities map.
    return ["read", "write", "delete", "admin"].includes(String(action));
  };

  const hasCapInRow = (row: any): boolean | null => {
    const caps = row?.capabilities as Record<string, boolean> | null | undefined;
    if (!caps || typeof caps !== "object") return null;
    if (!(capability in caps)) return null;
    return caps[capability] === true;
  };

  // 1) Direct file permission grant
  const filePermCandidates = await prisma.permission.findMany({
    where: {
      resourceType: "file",
      resourceId: fileId,
      OR: orClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
    select: { action: true, capabilities: true },
    orderBy: { createdAt: "desc" },
  });
  const filePerm = pickHighestPriorityPermission(filePermCandidates as any[]);
  if (filePerm) {
    const explicit = hasCapInRow(filePerm);
    return explicit ?? readByAction(filePerm.action);
  }

  // 2) Folder permission grant on containing folder OR an ancestor with apply_subfolders
  if (!folderId) return false;

  const chain = await getAncestorChainForFolder(tenantId, folderId, 80);

  const folderPerms = await prisma.permission.findMany({
    where: {
      resourceType: "folder",
      resourceId: { in: chain },
      OR: orClauses,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { folder: { tenantId } },
      ],
    },
    select: { resourceId: true, action: true, capabilities: true },
  });

  for (const p of folderPerms) {
    const isSelf = p.resourceId === folderId;
    const caps = (p as any).capabilities as Record<string, boolean> | null;
    const canInherit = isSelf || caps?.apply_subfolders === true;
    if (!canInherit) continue;
    const explicit = hasCapInRow(p);
    return explicit ?? readByAction(p.action);
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
          roleContext?.capabilities.update_versions ||
          roleContext?.capabilities.move_files ||
          roleContext?.capabilities.edit_file_metadata)) ||
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

  const permCandidates = await prisma.permission.findMany({
    where: {
      resourceType: "file",
      resourceId: fileId,
      OR: permOrClauses,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
  const perm = pickHighestPriorityPermission(permCandidates as any[]);

  if (!perm) return false;
  return (actionRank[perm.action] ?? 0) >= required;
}
