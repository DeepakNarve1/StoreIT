/** File row from GET /files — shared by browser, list, grid, and detail */
export type BrowserFileItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  version?: number;
  uploadedById?: string;
  isStarred?: boolean;
  approvalStatus?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
  approvedBy?: { name: string } | null;
  isLocked?: boolean;
  lockedById?: string | null;
  categoryId?: string | null;
  metaRequiredMissingCount?: number;
  viewUrl?: string | null;
  activeWorkflowId?: string | null;
  currentStepOrder?: number | null;
};

export type CategoryOption = {
  id: string;
  name: string;
  color?: string | null;
};
