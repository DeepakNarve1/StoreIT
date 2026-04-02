import { Prisma } from "@prisma/client";
import { cancelActiveWorkflowForFile } from "./workflow.service";

type Tx = Prisma.TransactionClient;

/**
 * Permanently remove a file row and all dependent records (metadata, guest links,
 * workflows, etc.). Caller must delete blob storage keys after the transaction succeeds.
 */
export async function purgeFileRecordInTx(
  tx: Tx,
  params: {
    fileId: string;
    tenantId: string;
    actorUserId: string;
  },
): Promise<void> {
  const { fileId, tenantId, actorUserId } = params;

  await cancelActiveWorkflowForFile(tx, {
    fileId,
    tenantId,
    actorUserId,
    note: "Cancelled because the file was permanently deleted.",
  });

  await tx.file.updateMany({
    where: { id: fileId, tenantId },
    data: {
      activeWorkflowId: null,
      currentStepOrder: null,
      approvalStatus: null,
      approvedById: null,
      approvedAt: null,
      approvalNote: null,
    },
  });

  await tx.approvalWorkflow.deleteMany({
    where: { fileId, tenantId },
  });

  await tx.guestAccess.deleteMany({
    where: { fileId, tenantId },
  });

  await tx.fileMetadata.deleteMany({ where: { fileId } });
  await tx.fileComment.deleteMany({ where: { fileId } });
  await tx.fileTag.deleteMany({ where: { fileId } });
  await tx.permission.deleteMany({
    where: {
      OR: [{ fileId }, { resourceType: "file", resourceId: fileId }],
    },
  });
  await tx.oneTimeLink.deleteMany({ where: { fileId } });
  await tx.fileVersion.deleteMany({ where: { fileId } });
  await tx.file.delete({ where: { id: fileId, tenantId } });
}

/** All files under `folderIds` (any delete state), for permanent folder-tree removal. */
export async function purgeAllFilesUnderFolderIdsInTx(
  tx: Tx,
  params: {
    folderIds: string[];
    tenantId: string;
    actorUserId: string;
  },
): Promise<void> {
  const { folderIds, tenantId, actorUserId } = params;
  if (folderIds.length === 0) return;

  const files = await tx.file.findMany({
    where: { folderId: { in: folderIds }, tenantId },
    select: { id: true },
  });

  for (const { id } of files) {
    await purgeFileRecordInTx(tx, { fileId: id, tenantId, actorUserId });
  }
}
