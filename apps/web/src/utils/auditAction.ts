export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "file.upload": "File uploaded",
  "file.upload.version": "New version uploaded",
  "file.delete": "File deleted",
  "file.delete.permanent": "File permanently deleted",
  "file.bulk_delete": "Files deleted",
  "file.bulk_move": "Files moved",
  "file.download": "File downloaded",
  "file.view": "File viewed",
  "file.restore": "Version restored",
  "file.move": "File moved",
  "file.rename": "File renamed",
  "file.approval.submitted": "File submitted for approval",
  "file.approval.approved": "File approved",
  "file.approval.rejected": "File rejected",
  "file.link.revoked": "File link revoked",
  "file.workflow.started": "Workflow started",
  "file.workflow.step_approved": "Workflow step approved",
  "file.workflow.rejected": "Workflow rejected",
  "file.workflow.cancelled": "Workflow cancelled",
  "file.metadata.update": "File metadata updated",
  "file.metadata.bulk_update": "File metadata updated in bulk",
  "file.lock": "File locked",
  "file.unlock": "File unlocked",
  "folder.create": "Folder created",
  "folder.rename": "Folder renamed",
  "folder.delete": "Folder deleted",
  "folder.delete.permanent": "Folder permanently deleted",
  "permission.grant": "Permission granted",
  "permission.revoke": "Permission revoked",
  "link.generate": "Share link created",
  "link.access": "Link accessed",
  "user.invite": "User invited",
  "guest.share": "Guest share created",
  "user.login": "User logged in",
  "user.logout": "User logged out",
  "category.create": "Category created",
  "category.delete": "Category deleted",
  "superadmin.org.create": "Organisation created",
  "superadmin.org.update": "Organisation updated",
  "superadmin.org.suspend": "Organisation suspended",
  "superadmin.impersonate": "Impersonation started",
};

function titleCaseWords(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getAuditActionLabel(action: string) {
  const configured = AUDIT_ACTION_LABELS[action];
  if (configured) return configured;

  return titleCaseWords(action.replace(/[._]+/g, " "));
}
