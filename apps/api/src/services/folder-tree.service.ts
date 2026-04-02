import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";

/**
 * Delete folders in an order that respects `parentId` FKs (children before parents).
 * `deleteMany` with the whole tree can fail when the DB removes a parent before its children.
 */
export async function deleteFolderIdsLeavesFirstInTx(
  tx: Prisma.TransactionClient,
  folderIds: string[],
  tenantId: string,
): Promise<void> {
  if (folderIds.length === 0) return;
  const remaining = new Set(folderIds);
  const rows = await tx.folder.findMany({
    where: { id: { in: folderIds }, tenantId },
    select: { id: true, parentId: true },
  });
  const parentById = new Map(rows.map((r) => [r.id, r.parentId]));

  while (remaining.size > 0) {
    const leaves: string[] = [];
    for (const id of remaining) {
      let isParentOfRemaining = false;
      for (const rid of remaining) {
        if (rid === id) continue;
        if (parentById.get(rid) === id) {
          isParentOfRemaining = true;
          break;
        }
      }
      if (!isParentOfRemaining) leaves.push(id);
    }

    if (leaves.length === 0) {
      const id = remaining.values().next().value as string;
      await tx.folder.delete({ where: { id, tenantId } });
      remaining.delete(id);
      continue;
    }

    for (const fid of leaves) {
      await tx.folder.delete({ where: { id: fid, tenantId } });
      remaining.delete(fid);
    }
  }
}

/** All nested folder IDs under `folderId` (not including `folderId` itself). */
export async function getAllDescendantFolderIds(
  folderId: string,
  tenantId: string,
): Promise<string[]> {
  const children = await prisma.folder.findMany({
    where: { parentId: folderId, tenantId },
    select: { id: true },
  });

  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    const nested = await getAllDescendantFolderIds(child.id, tenantId);
    ids.push(...nested);
  }
  return ids;
}
