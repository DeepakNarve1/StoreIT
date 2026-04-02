import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  LayoutGrid,
  List,
  Upload,
  FolderPlus,
  Folder,
  SquarePen,
  Columns3,
  Database,
  ShieldCheck,
  ChevronRight,
  Home,
  Trash2,
  Hash,
  FolderInput,
  Download,
  Loader2,
  X,
  Settings,
  Share2,
  Tag,
  Info,
  GripVertical,
  Workflow,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FileGrid from "../components/files/FileGrid";
import FileList from "../components/files/FileList";
import clsx from "clsx";
import api from "../api/axios";
import { useToast } from "../components/ui/toastStore";
import { type RetentionAction } from "../components/files/RetentionModal";
import { useAuthStore } from "../store/authStore";
import { useFileCapabilities } from "../hooks/useFileCapabilities";
import { useFolderCapabilities } from "../hooks/useFolderCapabilities";
import DeleteModal from "../components/common/DeleteModal";
import axios from "axios";
import type { BrowserFileItem, CategoryOption } from "../types/file-browser";
import type {
  StartedApprovalWorkflow,
  WorkflowWithFile,
} from "../types/workflow";

type ViewMode = "grid" | "list";

const UploadZone = lazy(() => import("../components/files/UploadZone"));
const FileDocumentPreviewModal = lazy(
  () => import("../components/files/FileDocumentPreviewModal"),
);
const FileDetailsView = lazy(
  () => import("../components/files/FileDetailsView"),
);
const PermissionsPanel = lazy(
  () => import("../components/permissions/PermissionsPanel"),
);
const FileVersionsModal = lazy(
  () => import("../components/files/FileVersionsModal"),
);
const MoveFileModal = lazy(() => import("../components/files/MoveFileModal"));
const MoveFolderModal = lazy(
  () => import("../components/files/MoveFolderModal"),
);
const AssignCategoryModal = lazy(
  () => import("../components/files/AssignCategoryModal"),
);
const AssignTagModal = lazy(() => import("../components/files/AssignTagModal"));
const FileCommentsPanel = lazy(
  () => import("../components/files/FileCommentsPanel"),
);
const RetentionModal = lazy(() => import("../components/files/RetentionModal"));
const RetentionDetailsModal = lazy(
  () => import("../components/files/RetentionDetailsModal"),
);
const ApprovalDetailPanel = lazy(
  () => import("../components/files/ApprovalDetailPanel"),
);
const ApprovalWorkflowPanel = lazy(
  () => import("../components/files/ApprovalWorkflowPanel"),
);
const ApprovalWorkflowComposerModal = lazy(
  () => import("../components/files/ApprovalWorkflowComposerModal"),
);
const ApprovalWorkflowCenterPanel = lazy(
  () => import("../components/files/ApprovalWorkflowCenterPanel"),
);

interface StoreItem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { files: number; children: number };
  totalFiles?: number;
  totalMissingMeta?: number;
  categoryId?: string | null;
}

const RETENTION_QUEUE_KEY = "storeit_retention_queue_v1";

type RetentionJob = {
  id: string;
  scope: "file" | "folder";
  action: RetentionAction;
  resourceIds: string[];
  applyAt: number | null;
  createdAt: number;
  retention: string;
  reminder?: string | null;
  reminderAt?: number | null;
};

function loadRetentionQueue(): RetentionJob[] {
  try {
    const raw = localStorage.getItem(RETENTION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RetentionJob[];
  } catch {
    return [];
  }
}

function saveRetentionQueue(queue: RetentionJob[]) {
  localStorage.setItem(RETENTION_QUEUE_KEY, JSON.stringify(queue));
}

export default function FileBrowserPage() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showUpload, setShowUpload] = useState(
    () => searchParams.get("upload") === "1",
  );

  // Sync upload zone with ?upload=1 query param (e.g. from TopBar button)
  useEffect(() => {
    if (searchParams.get("upload") === "1") {
      setShowUpload(true);
    }
  }, [searchParams]);
  useEffect(() => {
    const qType = (searchParams.get("type") ?? "all").toLowerCase();
    const allowed = new Set([
      "all",
      "pdf",
      "image",
      "video",
      "word",
      "excel",
      "zip",
    ]);
    setTypeFilter(allowed.has(qType) ? qType : "all");
  }, [searchParams]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState<BrowserFileItem | null>(null);
  const [detailFile, setDetailFile] = useState<BrowserFileItem | null>(null);
  const versionFileInputRef = useRef<HTMLInputElement | null>(null);
  const [versionUploadTarget, setVersionUploadTarget] =
    useState<BrowserFileItem | null>(null);
  const [permissionsResource, setPermissionsResource] = useState<{
    id: string;
    type: "file" | "folder";
    name: string;
  } | null>(null);
  const [versionsFile, setVersionsFile] = useState<BrowserFileItem | null>(
    null,
  );
  const handleVersions = (file: BrowserFileItem) => setVersionsFile(file);
  const [moveFiles, setMoveFiles] = useState<BrowserFileItem[]>([]);
  const [moveFolders, setMoveFolders] = useState<StoreItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [newFolderCategoryId, setNewFolderCategoryId] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    "manual" | "name" | "size" | "createdAt" | "mimeType"
  >("manual");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [draggedFileIds, setDraggedFileIds] = useState<string[]>([]);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const folderMenuCloseTimerRef = useRef<number | null>(null);
  const uploadRefreshTimerRef = useRef<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [manualOrder, setManualOrder] = useState<{
    files: string[];
    folders: string[];
  }>({
    files: [],
    folders: [],
  });
  const [commentsFile, setCommentsFile] = useState<BrowserFileItem | null>(
    null,
  );
  const [categoryResource, setCategoryResource] = useState<{
    id: string;
    type: "file" | "folder";
    name: string;
    currentCategoryId?: string | null;
  } | null>(null);
  const [renameFile, setRenameFile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameFolder, setRenameFolder] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [approvalFile, setApprovalFile] = useState<BrowserFileItem | null>(
    null,
  );
  const [renameName, setRenameName] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalDetailFile, setApprovalDetailFile] =
    useState<BrowserFileItem | null>(null);
  const [workflowPanelFile, setWorkflowPanelFile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [workflowComposerFile, setWorkflowComposerFile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showWorkflowCenter, setShowWorkflowCenter] = useState(false);
  const [workflowTemplateApproverIds, setWorkflowTemplateApproverIds] =
    useState<string[]>([]);
  const [showBulkMetadataModal, setShowBulkMetadataModal] = useState(false);
  const [bulkMetadataFields, setBulkMetadataFields] = useState<
    Array<{ key: string; value: string }>
  >([{ key: "", value: "" }]);

  const [deleteTarget, setDeleteTarget] = useState<BrowserFileItem | null>(
    null,
  );
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkFolderDelete, setShowBulkFolderDelete] = useState(false);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [retentionScope, setRetentionScope] = useState<"file" | "folder">(
    "file",
  );
  const [isApplyingRetention, setIsApplyingRetention] = useState(false);
  const retentionQueueProcessingRef = useRef(false);
  const [retentionEditJobId, setRetentionEditJobId] = useState<string | null>(
    null,
  );
  const [retentionModalInitialValues, setRetentionModalInitialValues] =
    useState<{
      retention: string;
      retentionUntil?: string | null;
      action: RetentionAction;
    } | null>(null);
  /** Bumps on each open so RetentionModal remounts with fresh local state */
  const [retentionModalNonce, setRetentionModalNonce] = useState(0);

  const [showRetentionDetailsModal, setShowRetentionDetailsModal] =
    useState(false);
  const [retentionDetailsFile, setRetentionDetailsFile] =
    useState<BrowserFileItem | null>(null);
  const [retentionDetailsJob, setRetentionDetailsJob] = useState<{
    id: string;
    scope: "file" | "folder";
    action: RetentionAction;
    resourceIds: string[];
    applyAt: number | null;
    createdAt: number;
    retention: string;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingFolders, setIsDeletingFolders] = useState(false);
  const [showModifyMenu, setShowModifyMenu] = useState(false);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    type: true,
    size: true,
    modified: true,
    version: false,
    approval: false,
    retention: false,
    lock: true,
    metaNotFound: true,
  });

  // ── Tag modal state ───────────────────────────────────────────────────────
  // Stores the full file object so AssignTagModal can read its current tags
  const [tagFile, setTagFile] = useState<BrowserFileItem | null>(null);

  // ── Bulk download progress state ──────────────────────────────────────────
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<
    "zipping" | "downloading" | null
  >(null);

  // ── Folder bulk download progress state ─────────────────────────────────
  const [isZippingFolders, setIsZippingFolders] = useState(false);
  const [zipFoldersProgress, setZipFoldersProgress] = useState<
    "zipping" | "downloading" | null
  >(null);

  // Escape key closes any open modal/panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (approvalFile) {
        setApprovalFile(null);
        setApprovalNote("");
        return;
      }
      if (approvalDetailFile) {
        setApprovalDetailFile(null);
        return;
      }
      if (workflowPanelFile) {
        setWorkflowPanelFile(null);
        return;
      }
      if (workflowComposerFile) {
        setWorkflowComposerFile(null);
        return;
      }
      if (showWorkflowCenter) {
        setShowWorkflowCenter(false);
        return;
      }
      if (renameFile) {
        setRenameFile(null);
        return;
      }
      if (renameFolder) {
        setRenameFolder(null);
        return;
      }
      if (tagFile) {
        setTagFile(null);
        return;
      }
      if (showRetentionDetailsModal) {
        setShowRetentionDetailsModal(false);
        return;
      }
      if (showBulkMetadataModal) {
        setShowBulkMetadataModal(false);
        return;
      }
      if (showRetentionModal) {
        setShowRetentionModal(false);
        return;
      }
      if (commentsFile) {
        setCommentsFile(null);
        return;
      }
      if (versionsFile) {
        setVersionsFile(null);
        return;
      }
      if (previewFile) {
        setPreviewFile(null);
        return;
      }
      if (permissionsResource) {
        setPermissionsResource(null);
        return;
      }
      if (moveFiles.length > 0) {
        setMoveFiles([]);
        return;
      }
      if (categoryResource) {
        setCategoryResource(null);
        return;
      }
      if (showUpload) {
        setShowUpload(false);
        return;
      }
      if (showNewFolder) {
        setShowNewFolder(false);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    approvalFile,
    approvalDetailFile,
    workflowPanelFile,
    workflowComposerFile,
    showWorkflowCenter,
    renameFile,
    renameFolder,
    tagFile,
    commentsFile,
    versionsFile,
    previewFile,
    permissionsResource,
    moveFiles,
    categoryResource,
    showRetentionDetailsModal,
    showBulkMetadataModal,
    showRetentionModal,
    showUpload,
    showNewFolder,
    approvalNote,
  ]);

  useEffect(() => {
    return () => {
      if (folderMenuCloseTimerRef.current) {
        window.clearTimeout(folderMenuCloseTimerRef.current);
      }
      if (uploadRefreshTimerRef.current) {
        window.clearTimeout(uploadRefreshTimerRef.current);
      }
    };
  }, []);

  // ── Fetch files ───────────────────────────────────────────────────────────
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["files", folderId ?? "root", typeFilter],
    queryFn: async () => {
      const includeAll = !folderId && typeFilter !== "all";
      const res = await api.get("/files", {
        params: {
          folderId,
          type: typeFilter !== "all" ? typeFilter : undefined,
          ...(includeAll ? { includeAll: "1" } : {}),
        },
      });
      return res.data as { files: BrowserFileItem[] };
    },
  });
  const { user } = useAuthStore();
  const rawRole = (user?.roleProfile?.baseRole ?? user?.role ?? "").toUpperCase();
  const baseRole =
    rawRole === "ADMIN" || rawRole === "ORGADMIN" ? "ORG_ADMIN" : rawRole;
  // Use resolved roleCapabilities (from the profile) when available.
  // Fall back to role-string check only for built-in roles without a profile.
  const resolvedCaps = user?.roleCapabilities;
  const hasResolvedCaps = !!resolvedCaps && Object.keys(resolvedCaps).length > 0;
  const canWrite =
    baseRole === "SUPERADMIN" ||
    (hasResolvedCaps
      ? resolvedCaps.add_files === true || resolvedCaps.create_folders === true
      : ["ORG_ADMIN", "MANAGER", "EDITOR"].includes(baseRole));

  // ── Granular per-file capabilities for VIEWER role ───────────────────────
  const fileIds = (filesData?.files ?? []).map((f) => f.id);
  const { capMap } = useFileCapabilities(fileIds);

  // ── Fetch subfolders ──────────────────────────────────────────────────────
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ["folders", folderId ?? "root"],
    queryFn: async () => {
      const res = await api.get("/folders", {
        params: { parentId: folderId ?? null },
      });
      return res.data as { folders: StoreItem[] };
    },
  });

  const { data: workflowInboxData } = useQuery({
    queryKey: ["workflow-inbox"],
    queryFn: async () => {
      const res = await api.get("/workflow/inbox");
      return res.data as {
        items: Array<{
          workflowId: string;
          file: { id: string; name: string; approvalStatus?: string | null };
        }>;
      };
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/files/${id}/rename`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      setRenameFile(null);
      useToast.getState().add("File renamed");
    },
    onError: () => useToast.getState().add("Failed to rename file", "error"),
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await api.patch(`/folders/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["folders", folderId ?? "root"],
      });
      queryClient.invalidateQueries({
        queryKey: ["folders", "root"],
      });
      setRenameFolder(null);
      useToast.getState().add("Folder renamed");
    },
    onError: () => useToast.getState().add("Failed to rename folder", "error"),
  });

  const bulkMetadataMutation = useMutation({
    mutationFn: async (payload: {
      ids: string[];
      fields: Array<{ key: string; value: string }>;
    }) => {
      const res = await api.post("/files/bulk-metadata", payload);
      return res.data as {
        updatedCount: number;
        deniedCount: number;
        missingCount: number;
      };
    },
    onSuccess: (data) => {
      useToast
        .getState()
        .add(
          `Metadata applied to ${data.updatedCount} file(s)${
            data.deniedCount > 0 ? `, denied: ${data.deniedCount}` : ""
          }`,
          data.deniedCount > 0 ? "info" : "success",
        );
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      setShowBulkMetadataModal(false);
      setBulkMetadataFields([{ key: "", value: "" }]);
      setSelectedFiles([]);
    },
    onError: () =>
      useToast.getState().add("Failed to apply bulk metadata", "error"),
  });

  const submitApprovalMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.post(`/files/${fileId}/submit-approval`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      useToast.getState().add("File submitted for approval");
    },
    onError: () =>
      useToast.getState().add("Failed to submit for approval", "error"),
  });

  const lockMutation = useMutation({
    mutationFn: async ({
      fileId,
      isLocked,
    }: {
      fileId: string;
      isLocked: boolean;
    }) => {
      await api.post(`/files/${fileId}/${isLocked ? "unlock" : "lock"}`);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      useToast.getState().add(vars.isLocked ? "File unlocked" : "File locked");
    },
    onError: () => useToast.getState().add("Failed to update lock", "error"),
  });

  const uploadNewVersionMutation = useMutation({
    mutationFn: async ({
      targetFile,
      selectedFile,
    }: {
      targetFile: BrowserFileItem;
      selectedFile: File;
    }) => {
      const form = new FormData();
      const fileForUpload =
        selectedFile.name === targetFile.name
          ? selectedFile
          : new File([selectedFile], targetFile.name, {
              type: selectedFile.type || "application/octet-stream",
              lastModified: selectedFile.lastModified,
            });

      form.append("file", fileForUpload);
      if (folderId) form.append("folderId", folderId);
      const res = await api.post("/files/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data as { files?: BrowserFileItem[] };
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-inbox"] });
      const updated =
        data.files?.find((f) => f.id === vars.targetFile.id) ?? null;
      if (updated) {
        setDetailFile((prev) => ({
          ...(prev ?? vars.targetFile),
          ...updated,
          ...(prev?.approvalStatus === "in_review"
            ? {
                approvalStatus: "draft",
                activeWorkflowId: null,
                currentStepOrder: null,
              }
            : {}),
        }));
      }
      useToast.getState().add("New file version uploaded");
    },
    onError: (e: unknown) => {
      const msg = axios.isAxiosError(e)
        ? String(
            (e.response?.data as { error?: string } | undefined)?.error ?? "",
          ) || "Failed to upload new version"
        : "Failed to upload new version";
      useToast.getState().add(msg, "error");
    },
  });

  const starMutation = useMutation({
    mutationFn: async (file: BrowserFileItem) => {
      await api.patch(`/files/${file.id}/star`);
    },
    onSuccess: (_, file) => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["files", "starred"] });
      useToast
        .getState()
        .add(file.isStarred ? "Removed from starred" : "Added to starred");
    },
    onError: () => useToast.getState().add("Failed to update star", "error"),
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      fileId,
      action,
      note,
    }: {
      fileId: string;
      action: "approved" | "rejected";
      note?: string;
    }) => {
      await api.post(`/files/${fileId}/approve`, { action, note });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      setApprovalFile(null);
      setApprovalNote("");
      useToast
        .getState()
        .add(vars.action === "approved" ? "File approved" : "File rejected");
    },
    onError: () =>
      useToast.getState().add("Failed to process approval", "error"),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get("/categories");
      return res.data as { categories: CategoryOption[] };
    },
  });
  const categories = categoriesData?.categories ?? [];

  const { data: ancestorsData } = useQuery({
    queryKey: ["folder-ancestors", folderId],
    queryFn: async () => {
      if (!folderId) return { ancestors: [] };
      const res = await api.get(`/folders/${folderId}/ancestors`);
      return res.data as { ancestors: { id: string; name: string }[] };
    },
    enabled: !!folderId,
  });
  const ancestors = ancestorsData?.ancestors ?? [];

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post("/folders", {
        name,
        parentId: folderId ?? null,
        categoryId: newFolderCategoryId || null,
      });
      return res.data as {
        folder: {
          id: string;
          name: string;
          parentId: string | null;
          categoryId: string | null;
          createdAt: string;
        };
      };
    },
    onSuccess: (data) => {
      const created = data?.folder;
      if (created) {
        const listKey = created.parentId ?? "root";
        const item: StoreItem = {
          id: created.id,
          name: created.name,
          parentId: created.parentId,
          _count: { files: 0, children: 0 },
          categoryId: created.categoryId ?? null,
        };
        queryClient.setQueryData<{ folders: StoreItem[] }>(
          ["folders", listKey],
          (current) => {
            if (!current) return { folders: [item] };
            if (current.folders.some((f) => f.id === item.id)) return current;
            return { ...current, folders: [...current.folders, item] };
          },
        );
      }
      // Same as upload: invalidate + refetch all folder/file browser queries (Sidebar uses ["folders","all"]).
      invalidateBrowserQueries();
      setNewFolderName("");
      setNewFolderCategoryId("");
      setShowNewFolder(false);
    },
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) =>
      api.post("/files/bulk-delete", { ids }),
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSelectedFiles([]);
      useToast.getState().add(`${ids.length} files deleted`);
    },
    onError: () => useToast.getState().add("Failed to delete files", "error"),
  });

  const bulkDownload = async () => {
    try {
      setIsZipping(true);
      setZipProgress("zipping");
      const res = await api.post(
        "/files/bulk-download",
        { ids: selectedFiles },
        {
          responseType: "blob",
          onDownloadProgress: () => setZipProgress("downloading"),
        },
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `storeit-files-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      useToast.getState().add(`${selectedFiles.length} files downloaded`);
    } catch {
      useToast.getState().add("Failed to download files", "error");
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };
  const bulkFolderDownload = async () => {
    try {
      setIsZippingFolders(true);
      setZipFoldersProgress("zipping");
      const res = await api.post(
        "/folders/bulk-download",
        { ids: selectedFolders },
        {
          responseType: "blob",
          onDownloadProgress: () => setZipFoldersProgress("downloading"),
        },
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `storeit-folders-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      useToast.getState().add(`${selectedFolders.length} folders downloaded`);
    } catch {
      useToast.getState().add("Failed to download folders", "error");
    } finally {
      setIsZippingFolders(false);
      setZipFoldersProgress(null);
    }
  };

  const bulkFolderMove = () => {
    if (selectedFolders.length === 0) return;
    const selected = folders.filter((f) => selectedFolders.includes(f.id));
    if (selected.length !== selectedFolders.length) {
      useToast.getState().add("Some selected folders are missing", "error");
      return;
    }
    setMoveFolders(selected);
  };

  const bulkFolderDelete = async () => {
    if (selectedFolders.length === 0) return;
    setIsDeletingFolders(true);
    try {
      await Promise.all(
        selectedFolders.map((id) => api.delete(`/folders/${id}`)),
      );
      queryClient.invalidateQueries({
        queryKey: ["folders", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["folders", "root"] });
      setSelectedFolders([]);
      useToast.getState().add("Selected folders deleted");
    } catch {
      useToast.getState().add("Failed to delete selected folders", "error");
    } finally {
      setIsDeletingFolders(false);
      setShowBulkFolderDelete(false);
    }
  };

  const invalidateBrowserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["files"] });
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    queryClient.invalidateQueries({ queryKey: ["recent-files"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    // Force immediate refresh so users don't need to reload.
    queryClient.refetchQueries({ queryKey: ["files"] });
    queryClient.refetchQueries({ queryKey: ["folders"] });
  };

  const applyImmediateMoveResult = (
    fileIds: string[],
    targetFolderId: string | null,
  ) => {
    const currentContainerId = folderId ?? null;
    const isGlobalFilteredView = !folderId && typeFilter !== "all";
    const movedIds = new Set(fileIds);

    if (!isGlobalFilteredView && targetFolderId !== currentContainerId) {
      queryClient.setQueryData<{ files: BrowserFileItem[] }>(
        ["files", folderId ?? "root", typeFilter],
        (current) =>
          current
            ? {
                ...current,
                files: current.files.filter((file) => !movedIds.has(file.id)),
              }
            : current,
      );

      setManualOrder((prev) => ({
        ...prev,
        files: prev.files.filter((id) => !movedIds.has(id)),
      }));
    }

    queryClient.setQueryData<{ folders: StoreItem[] }>(
      ["folders", folderId ?? "root"],
      (current) =>
        current
          ? {
              ...current,
              folders: current.folders.map((folder) => {
                if (folder.id === targetFolderId) {
                  return {
                    ...folder,
                    _count: {
                      ...folder._count,
                      files: folder._count.files + fileIds.length,
                    },
                  };
                }
                if (currentContainerId && folder.id === currentContainerId) {
                  return {
                    ...folder,
                    _count: {
                      ...folder._count,
                      files: Math.max(0, folder._count.files - fileIds.length),
                    },
                  };
                }
                return folder;
              }),
            }
          : current,
    );

    // Also update the global folders cache used by the Sidebar (queryKey: ["folders","all"]).
    // This keeps the folder counts in sync across the app so users don't need to refresh.
    queryClient.setQueryData<{ folders: StoreItem[] }>(
      ["folders", "all"],
      (current) =>
        current
          ? {
              ...current,
              folders: current.folders.map((folder) => {
                if (folder.id === targetFolderId) {
                  return {
                    ...folder,
                    _count: {
                      ...folder._count,
                      files: folder._count.files + fileIds.length,
                    },
                  };
                }

                if (currentContainerId && folder.id === currentContainerId) {
                  return {
                    ...folder,
                    _count: {
                      ...folder._count,
                      files: Math.max(0, folder._count.files - fileIds.length),
                    },
                  };
                }

                return folder;
              }),
            }
          : current,
    );
  };

  const dragMove = useMutation({
    mutationFn: async ({
      fileIds,
      targetFolderId,
    }: {
      fileIds: string[];
      targetFolderId: string;
    }) => {
      if (fileIds.length === 1) {
        return api.patch(`/files/${fileIds[0]}/move`, {
          folderId: targetFolderId,
        });
      }

      return api.post("/files/bulk-move", {
        ids: fileIds,
        folderId: targetFolderId,
      });
    },
    onSuccess: async (_, vars) => {
      applyImmediateMoveResult(vars.fileIds, vars.targetFolderId);
      invalidateBrowserQueries();
      setSelectedFiles((prev) =>
        prev.filter((id) => !vars.fileIds.includes(id)),
      );
      useToast
        .getState()
        .add(
          vars.fileIds.length > 1
            ? `${vars.fileIds.length} files moved`
            : "File moved",
        );
    },
    onError: () => useToast.getState().add("Failed to move file", "error"),
  });

  const ORDER_KEY = `storeit-browser-order:${folderId ?? "root"}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (!raw) {
        setManualOrder({ files: [], folders: [] });
        return;
      }
      const parsed = JSON.parse(raw);
      setManualOrder({
        files: Array.isArray(parsed?.files)
          ? parsed.files.filter(
              (x: unknown): x is string => typeof x === "string",
            )
          : [],
        folders: Array.isArray(parsed?.folders)
          ? parsed.folders.filter(
              (x: unknown): x is string => typeof x === "string",
            )
          : [],
      });
    } catch {
      setManualOrder({ files: [], folders: [] });
    }
  }, [ORDER_KEY]);

  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(manualOrder));
    } catch {
      // Non-fatal
    }
  }, [ORDER_KEY, manualOrder]);

  const { data: folderOrderPrefData } = useQuery({
    queryKey: ["pref-folder-order", folderId ?? "root"],
    enabled: !!folderId,
    queryFn: async () => {
      const res = await api.get("/preferences/folder-order", {
        params: { folderId },
      });
      return res.data as { files: string[]; folders: string[] };
    },
  });
  useEffect(() => {
    if (!folderOrderPrefData) return;
    setManualOrder({
      files: Array.isArray(folderOrderPrefData.files)
        ? folderOrderPrefData.files.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      folders: Array.isArray(folderOrderPrefData.folders)
        ? folderOrderPrefData.folders.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
    });
  }, [folderOrderPrefData]);

  const saveFolderOrder = useMutation({
    mutationFn: async (payload: {
      folderId: string;
      files: string[];
      folders: string[];
    }) => {
      await api.put("/preferences/folder-order", payload);
    },
  });

  const applyManualOrder = <T extends { id: string }>(
    items: T[],
    ids: string[],
  ) => {
    if (!items.length) return items;
    const byId = new Map(items.map((i) => [i.id, i]));
    const ordered: T[] = [];
    ids.forEach((id) => {
      const it = byId.get(id);
      if (it) ordered.push(it);
    });
    items.forEach((it) => {
      if (!ordered.some((x) => x.id === it.id)) ordered.push(it);
    });
    return ordered;
  };

  const reorderIds = (ids: string[], fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return ids;
    const base = [...ids];
    const from = base.indexOf(fromId);
    const to = base.indexOf(toId);
    if (from < 0 || to < 0) return ids;
    const [moved] = base.splice(from, 1);
    base.splice(to, 0, moved);
    return base;
  };

  const allFiles = filesData?.files ?? [];
  const files = applyManualOrder(allFiles, manualOrder.files);
  const foldersRaw = foldersData?.folders ?? [];
  const folders =
    typeFilter === "all"
      ? applyManualOrder(foldersRaw, manualOrder.folders)
      : [];
  const folderIds = folderId
    ? Array.from(new Set([...folders.map((f) => f.id), folderId]))
    : folders.map((f) => f.id);
  const { capMap: folderCapMap } = useFolderCapabilities(folderIds);
  const isLoading = filesLoading || foldersLoading;
  const isFilteredEmpty = files.length === 0 && typeFilter !== "all";
  const isEmpty = allFiles.length === 0 && folders.length === 0;

  const handleUploadComplete = () => {
    if (uploadRefreshTimerRef.current) {
      window.clearTimeout(uploadRefreshTimerRef.current);
    }
    uploadRefreshTimerRef.current = window.setTimeout(() => {
      invalidateBrowserQueries();
      uploadRefreshTimerRef.current = null;
    }, 150);
  };

  const handleFileDragStart = useCallback(
    (file: BrowserFileItem) => {
      const ids =
        selectedFiles.length > 1 && selectedFiles.includes(file.id)
          ? selectedFiles
          : [file.id];
      setDraggedFileIds(ids);
    },
    [selectedFiles],
  );

  const handleFileClick = useCallback((file: BrowserFileItem) => {
    setSelectedFiles([]);
    setSelectedFolders([]);
    setDetailFile(file);
  }, []);
  const handleOpenVersionUpload = (file: BrowserFileItem) => {
    if (!fileCan(file.id, "update_versions")) {
      useToast
        .getState()
        .add("You don't have permission to upload a new version.", "error");
      return;
    }
    setVersionUploadTarget(file);
    versionFileInputRef.current?.click();
  };
  const handleVersionFileSelected = (selected?: File | null) => {
    if (!selected || !versionUploadTarget) return;
    const getExt = (name: string) => {
      const idx = name.lastIndexOf(".");
      return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
    };
    const currentExt = getExt(versionUploadTarget.name ?? "");
    const selectedExt = getExt(selected.name ?? "");
    const currentMime = String(
      versionUploadTarget.mimeType ?? "",
    ).toLowerCase();
    const selectedMime = String(selected.type ?? "").toLowerCase();

    // New version must stay same type as the existing file.
    // Otherwise preview/open flows can break (e.g. PDF uploaded over PNG name).
    const extMismatch =
      !!currentExt && !!selectedExt && currentExt !== selectedExt;
    const mimeMismatch =
      !!currentMime &&
      !!selectedMime &&
      currentMime.split(";")[0] !== selectedMime.split(";")[0];
    if (extMismatch || mimeMismatch) {
      useToast
        .getState()
        .add(
          `Version type mismatch. Existing file is ${currentExt || currentMime}; please upload the same file type.`,
          "error",
        );
      return;
    }

    if (selected.name !== versionUploadTarget.name) {
      useToast
        .getState()
        .add(
          `Selected file renamed to "${versionUploadTarget.name}" to keep version history on the same document.`,
          "info",
        );
    }
    uploadNewVersionMutation.mutate({
      targetFile: versionUploadTarget,
      selectedFile: selected,
    });
    setVersionUploadTarget(null);
  };
  const handleShare = useCallback((file: BrowserFileItem) => {
    setPermissionsResource({ id: file.id, type: "file", name: file.name });
  }, []);
  const handleFolderShare = (folder: StoreItem) => {
    setPermissionsResource({
      id: folder.id,
      type: "folder",
      name: folder.name,
    });
  };
  const handleFolderDownload = async (folder: StoreItem) => {
    try {
      setIsZippingFolders(true);
      setZipFoldersProgress("zipping");
      const res = await api.get(`/folders/${folder.id}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folder.name}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      useToast.getState().add("Failed to download folder", "error");
    } finally {
      setIsZippingFolders(false);
      setZipFoldersProgress(null);
    }
  };
  const handleSort = useCallback(
    (col: "name" | "size" | "createdAt" | "mimeType") => {
      if (sortBy === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setSortBy(col);
      setSortDir("asc");
    },
    [sortBy],
  );
  const handleDelete = useCallback((file: BrowserFileItem) => {
    setDeleteTarget(file);
  }, []);

  const fileCan = (fileId: string, cap: string) =>
    canWrite || capMap[fileId]?.[cap] === true;
  const folderCan = (folderId: string, cap: string) =>
    canWrite || folderCapMap[folderId]?.[cap] === true;

  const canCreateFolderHere =
    baseRole === "SUPERADMIN" ||
    (baseRole === "VIEWER"
      ? resolvedCaps?.create_folders === true ||
        (!!folderId && folderCan(folderId, "create_folders"))
      : hasResolvedCaps
        ? ["ORG_ADMIN", "MANAGER", "EDITOR"].includes(baseRole)
          ? resolvedCaps.create_folders !== false
          : resolvedCaps.create_folders === true
        : ["ORG_ADMIN", "MANAGER", "EDITOR"].includes(baseRole));
  const reorderFileItems = useCallback(
    (fromId: string, toId: string) => {
      setSortBy("manual");
      setSortDir("asc");
      setManualOrder((prev) => {
        const next = {
          ...prev,
          files: reorderIds(
            files.map((f) => f.id),
            fromId,
            toId,
          ),
        };
        if (folderId) {
          saveFolderOrder.mutate({
            folderId,
            files: next.files,
            folders: next.folders,
          });
        }
        return next;
      });
    },
    [files, folderId, saveFolderOrder],
  );
  const reorderFolderItems = useCallback(
    (fromId: string, toId: string) => {
      setSortBy("manual");
      setSortDir("asc");
      setManualOrder((prev) => {
        const next = {
          ...prev,
          folders: reorderIds(
            folders.map((f) => f.id),
            fromId,
            toId,
          ),
        };
        if (folderId) {
          saveFolderOrder.mutate({
            folderId,
            files: next.files,
            folders: next.folders,
          });
        }
        return next;
      });
    },
    [folders, folderId, saveFolderOrder],
  );

  const selectedFileObjects = files.filter((f) => selectedFiles.includes(f.id));
  const singleSelectedFile =
    selectedFiles.length === 1
      ? files.find((f) => f.id === selectedFiles[0])
      : null;
  const workflowInboxItems = workflowInboxData?.items ?? [];
  const workflowToolbarFile = detailFile ?? singleSelectedFile ?? null;

  const openWorkflowComposer = useCallback(
    (file: { id: string; name: string }, initialApproverIds: string[] = []) => {
      setWorkflowTemplateApproverIds(initialApproverIds);
      setWorkflowComposerFile({ id: file.id, name: file.name });
    },
    [],
  );

  const patchDetailWorkflowState = (
    workflow: StartedApprovalWorkflow | WorkflowWithFile,
  ) => {
    const targetId = workflow.fileId ?? (workflow as WorkflowWithFile).file?.id;
    if (!targetId) return;
    const wf = workflow as WorkflowWithFile;
    setDetailFile((prev) =>
      prev && prev.id === targetId
        ? {
            ...prev,
            approvalStatus:
              workflow.file?.approvalStatus ?? wf.status ?? prev.approvalStatus,
            activeWorkflowId: wf.status === "in_review" ? workflow.id : null,
            currentStepOrder:
              workflow.file?.currentStepOrder ??
              workflow.currentStepOrder ??
              null,
          }
        : prev,
    );
  };

  const singleSelectedFolder =
    selectedFolders.length === 1
      ? (folders.find((f) => f.id === selectedFolders[0]) ?? null)
      : null;

  const canUseMetaToolbar = (() => {
    // Bulk file metadata edit requires edit_metadata on all selected files.
    if (selectedFiles.length > 1 && selectedFolders.length === 0) {
      return selectedFiles.every((id) => fileCan(id, "edit_metadata"));
    }
    // Single file selection.
    if (selectedFiles.length === 1 && singleSelectedFile) {
      return fileCan(singleSelectedFile.id, "edit_metadata");
    }
    // Single folder selection.
    if (selectedFolders.length === 1 && singleSelectedFolder) {
      return folderCan(singleSelectedFolder.id, "edit_metadata");
    }
    // Folder context shortcut (no selection, browsing inside a folder).
    if (!selectedFiles.length && !selectedFolders.length && folderId) {
      return folderCan(folderId, "edit_metadata");
    }
    return false;
  })();

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/files/${deleteTarget.id}`);
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      useToast.getState().add("File deleted successfully");
    } catch (e: unknown) {
      if (
        axios.isAxiosError(e) &&
        e.response?.data &&
        typeof e.response.data === "object" &&
        e.response.data !== null &&
        "error" in e.response.data
      ) {
        useToast
          .getState()
          .add(String((e.response.data as { error: string }).error), "error");
      } else {
        useToast.getState().add("Failed to delete file", "error");
      }
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (!canCreateFolderHere) {
      useToast
        .getState()
        .add("You don't have permission to create folders here.", "error");
      return;
    }
    createFolder.mutate(newFolderName.trim());
  };
  const handleMove = useCallback((file: BrowserFileItem) => {
    setMoveFiles([file]);
  }, []);
  const handleFolderAssignCategory = (folder: StoreItem) =>
    setCategoryResource({
      id: folder.id,
      type: "folder",
      name: folder.name,
      currentCategoryId: folder.categoryId,
    });

  const openFileMetadataPage = useCallback(
    (file: { id: string; name: string }) => {
      navigate(`/metadata/file/${file.id}`, {
        state: {
          fileName: file.name,
          backPath: folderId ? `/browse/${folderId}` : "/browse",
        },
      });
    },
    [navigate, folderId],
  );

  const handleStarFile = useCallback(
    (file: BrowserFileItem) => {
      starMutation.mutate(file);
    },
    [starMutation],
  );

  const handleFileDragEnd = useCallback(() => {
    setDraggedFileIds([]);
  }, []);

  const handleRenameFileOpen = useCallback((file: BrowserFileItem) => {
    setRenameFile(file);
    setRenameName(file.name);
  }, []);

  const handleLockFile = useCallback(
    (file: BrowserFileItem) => {
      lockMutation.mutate({
        fileId: file.id,
        isLocked: !!file.isLocked,
      });
    },
    [lockMutation],
  );

  const handleAssignCategoryFile = useCallback((file: BrowserFileItem) => {
    setCategoryResource({
      id: file.id,
      type: "file",
      name: file.name,
      currentCategoryId: file.categoryId ?? null,
    });
  }, []);

  const handleAssignTagFile = useCallback((file: BrowserFileItem) => {
    setTagFile(file);
  }, []);

  const handleCommentsOpen = useCallback((file: BrowserFileItem) => {
    setCommentsFile(file);
  }, []);

  const handleSubmitApprovalOpen = useCallback(
    (file: BrowserFileItem) => {
      openWorkflowComposer(file);
    },
    [openWorkflowComposer],
  );

  const handleApprovalDetailOpen = useCallback((file: BrowserFileItem) => {
    setWorkflowPanelFile({ id: file.id, name: file.name });
  }, []);

  const openFolderMetadataPage = (folder: { id: string; name: string }) => {
    if (!folderCan(folder.id, "edit_metadata")) {
      useToast
        .getState()
        .add("You don't have permission to edit folder metadata", "error");
      return;
    }
    navigate(`/metadata/folder/${folder.id}`, {
      state: {
        folderName: folder.name,
        backPath: folderId ? `/browse/${folderId}` : "/browse",
      },
    });
  };

  const openBulkMetadataModal = () => {
    if (selectedFiles.length <= 1 || selectedFolders.length > 0) return;
    if (!selectedFiles.every((id) => fileCan(id, "edit_metadata"))) {
      useToast
        .getState()
        .add(
          "You don't have permission to edit metadata for all selected files",
          "error",
        );
      return;
    }
    setBulkMetadataFields([{ key: "", value: "" }]);
    setShowBulkMetadataModal(true);
  };

  const handleMetaToolbar = () => {
    if (selectedFiles.length > 1 && selectedFolders.length === 0) {
      setShowModifyMenu(false);
      setShowColumnsMenu(false);
      openBulkMetadataModal();
      return;
    }

    if (selectedFiles.length === 1 && singleSelectedFile) {
      if (!fileCan(singleSelectedFile.id, "edit_metadata")) {
        useToast
          .getState()
          .add("You don't have permission to edit metadata", "error");
        return;
      }
      setShowModifyMenu(false);
      setShowColumnsMenu(false);
      openFileMetadataPage(singleSelectedFile);
      return;
    }

    if (selectedFolders.length === 1) {
      const singleSelectedFolder =
        folders.length > 0
          ? folders.find((f) => f.id === selectedFolders[0])
          : null;
      if (!singleSelectedFolder) {
        useToast
          .getState()
          .add("Select exactly one folder to edit metadata", "error");
        return;
      }
      if (!folderCan(singleSelectedFolder.id, "edit_metadata")) {
        useToast
          .getState()
          .add("You don't have permission to edit folder metadata", "error");
        return;
      }
      setShowModifyMenu(false);
      setShowColumnsMenu(false);
      openFolderMetadataPage(singleSelectedFolder);
      return;
    }

    // Folder context shortcut:
    // when browsing inside a folder with no current selection, edit current folder metadata.
    if (!selectedFiles.length && !selectedFolders.length && folderId) {
      if (!folderCan(folderId, "edit_metadata")) {
        useToast
          .getState()
          .add("You don't have permission to edit folder metadata", "error");
        return;
      }
      const currentFolderName =
        ancestors.length > 0
          ? (ancestors[ancestors.length - 1]?.name ?? "Folder")
          : "Folder";
      setShowModifyMenu(false);
      setShowColumnsMenu(false);
      openFolderMetadataPage({ id: folderId, name: currentFolderName });
      return;
    }

    useToast
      .getState()
      .add("Select exactly one file or one folder to edit metadata", "error");
  };

  const openRetentionToolbar = () => {
    // Detailed file view shortcut:
    // if a file detail is open and nothing is selected, allow retention directly.
    if (
      detailFile &&
      selectedFiles.length === 0 &&
      selectedFolders.length === 0
    ) {
      if (!fileCan(detailFile.id, "delete_files")) {
        useToast
          .getState()
          .add(
            "You don't have permission to set retention for this file",
            "error",
          );
        return;
      }
      setSelectedFiles([detailFile.id]);
      setSelectedFolders([]);
      setRetentionScope("file");
      setRetentionModalNonce((n) => n + 1);
      setShowRetentionModal(true);
      return;
    }
    if (selectedFiles.length === 0 && selectedFolders.length === 0) {
      useToast.getState().add("Select file(s) or folder(s) to apply retention");
      return;
    }
    if (selectedFiles.length > 0 && selectedFolders.length > 0) {
      useToast
        .getState()
        .add(
          "Select either files or folders (not both) for retention",
          "error",
        );
      return;
    }
    if (selectedFiles.length > 0) {
      const ok = selectedFiles.every((id) => fileCan(id, "delete_files"));
      if (!ok) {
        useToast
          .getState()
          .add(
            "Retention requires delete permission for all selected files",
            "error",
          );
        return;
      }
      setRetentionScope("file");
      setRetentionModalNonce((n) => n + 1);
      setShowRetentionModal(true);
      return;
    }
    const ok = selectedFolders.every((id) => folderCan(id, "delete_folders"));
    if (!ok) {
      useToast
        .getState()
        .add(
          "Retention requires delete permission for all selected folders",
          "error",
        );
      return;
    }
    setRetentionScope("folder");
    setRetentionModalNonce((n) => n + 1);
    setShowRetentionModal(true);
  };

  const applyRetention = async (payload: {
    retention: string;
    retentionUntil?: string | null;
    action: RetentionAction;
    reminder?: string | null;
    reminderAt?: string | null;
  }) => {
    try {
      setIsApplyingRetention(true);

      const ids = retentionScope === "file" ? selectedFiles : selectedFolders;
      if (!ids || ids.length === 0) {
        useToast.getState().add("Select items first", "error");
        return;
      }
      if (retentionScope === "file") {
        const ok = ids.every((id) => fileCan(id, "delete_files"));
        if (!ok) {
          useToast
            .getState()
            .add(
              "Retention requires delete permission for all selected files",
              "error",
            );
          return;
        }
      } else {
        const ok = ids.every((id) => folderCan(id, "delete_folders"));
        if (!ok) {
          useToast
            .getState()
            .add(
              "Retention requires delete permission for all selected folders",
              "error",
            );
          return;
        }
      }

      const now = Date.now();
      const queue = loadRetentionQueue();
      const isEditing = !!retentionEditJobId;
      const jobId = isEditing
        ? retentionEditJobId
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      // Override semantics: when editing, replace any existing scheduled jobs
      // for these ids in the current scope.
      const idSet = new Set(ids);
      const filteredQueue = queue.filter((j) => {
        if (j.scope !== retentionScope) return true;
        const intersects = (j.resourceIds ?? []).some((rid) => idSet.has(rid));
        return !intersects;
      });

      // Clear any stale "upcoming deletion" notification flags for this job.
      const NOTIF_KEY = "storeit_retention_notifications_v1";
      if (jobId) {
        try {
          const raw = localStorage.getItem(NOTIF_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed[jobId]) {
              delete parsed[jobId];
              localStorage.setItem(NOTIF_KEY, JSON.stringify(parsed));
            }
          }
        } catch {
          // Non-fatal
        }
      }

      // Infinite retention means "never trigger action automatically".
      if (payload.retention === "infinite") {
        const job: RetentionJob = {
          id: jobId,
          scope: retentionScope,
          action: payload.action,
          resourceIds: [...ids],
          applyAt: null,
          createdAt: now,
          retention: "infinite",
          reminder: payload.reminder ?? null,
          reminderAt: payload.reminderAt
            ? new Date(payload.reminderAt).getTime()
            : null,
        };
        saveRetentionQueue([...filteredQueue, job]);

        useToast
          .getState()
          .add(
            `Retention set to Infinite for ${ids.length} ${retentionScope}(s)`,
            "info",
          );
        if (retentionScope === "file") setSelectedFiles([]);
        if (retentionScope === "folder") setSelectedFolders([]);
        return;
      }

      let applyAt: number | null = null;
      if (payload.retention === "7d") applyAt = now + 7 * 24 * 60 * 60 * 1000;
      else if (payload.retention === "30d")
        applyAt = now + 30 * 24 * 60 * 60 * 1000;
      else if (payload.retention === "90d")
        applyAt = now + 90 * 24 * 60 * 60 * 1000;
      else if (payload.retention === "custom") {
        if (!payload.retentionUntil) {
          applyAt = null;
        } else {
          const dt = new Date(payload.retentionUntil);
          const t = dt.getTime();
          applyAt = Number.isNaN(t) ? null : t;
        }
      }

      if (applyAt === null) {
        useToast.getState().add("Invalid retention timing", "error");
        return;
      }

      const job: RetentionJob = {
        id: jobId,
        scope: retentionScope,
        action: payload.action,
        resourceIds: [...ids],
        applyAt,
        createdAt: now,
        retention: payload.retention,
        reminder: payload.reminder ?? null,
        reminderAt: payload.reminderAt
          ? new Date(payload.reminderAt).getTime()
          : null,
      };
      saveRetentionQueue([...filteredQueue, job]);

      useToast
        .getState()
        .add(`Retention scheduled for ${new Date(applyAt).toLocaleString()}`);
      if (retentionScope === "file") setSelectedFiles([]);
      if (retentionScope === "folder") setSelectedFolders([]);
    } catch {
      useToast.getState().add("Failed to schedule retention", "error");
    } finally {
      setIsApplyingRetention(false);
      setShowRetentionModal(false);
      setRetentionEditJobId(null);
      setRetentionModalInitialValues(null);
    }
  };

  const epochMsToDatetimeLocal = (epochMs: number) => {
    const d = new Date(epochMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    // datetime-local expects "YYYY-MM-DDTHH:mm" in local time.
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}`;
  };

  const getCurrentRetentionJobForFile = useCallback(
    (fileId: string): RetentionJob | null => {
      const jobs = loadRetentionQueue();
      let best: RetentionJob | null = null;

      for (const job of jobs) {
        if (job.scope !== "file") continue;
        if (!(job.resourceIds ?? []).includes(fileId)) continue;

        // Infinite wins over finite.
        if (job.applyAt === null) {
          best = job;
          continue;
        }

        if (!best) {
          best = job;
          continue;
        }

        // If current best is Infinite, it already wins.
        if (best.applyAt === null) continue;

        if (
          best.applyAt !== null &&
          job.applyAt !== null &&
          job.applyAt < best.applyAt
        ) {
          best = job;
        }
      }

      return best;
    },
    [],
  );

  const openRetentionDetails = useCallback(
    (file: BrowserFileItem) => {
      if (!fileCan(file.id, "delete_files")) {
        useToast
          .getState()
          .add(
            "You don't have permission to manage retention for this file",
            "error",
          );
        return;
      }
      const job = getCurrentRetentionJobForFile(file.id);
      setRetentionDetailsFile(file);
      setRetentionDetailsJob(job);
      setShowRetentionDetailsModal(true);
    },
    [getCurrentRetentionJobForFile],
  );

  const handleEditRetention = () => {
    if (!retentionDetailsFile) return;

    setShowRetentionDetailsModal(false);
    setRetentionScope("file");
    setSelectedFiles([retentionDetailsFile.id]);

    const job = retentionDetailsJob;
    setRetentionEditJobId(job?.id ?? null);

    if (job) {
      if (job.applyAt === null) {
        setRetentionModalInitialValues({
          retention: "infinite",
          retentionUntil: null,
          action: job.action,
        });
      } else {
        setRetentionModalInitialValues({
          retention: "custom",
          retentionUntil: epochMsToDatetimeLocal(job.applyAt),
          action: job.action,
        });
      }
    } else {
      setRetentionModalInitialValues(null);
    }

    setRetentionModalNonce((n) => n + 1);
    setShowRetentionModal(true);
  };

  // Local retention scheduler:
  // - When user applies a finite retention, we store a job in localStorage.
  // - Every few seconds we check due jobs and run the underlying delete/move APIs.
  // This makes the retention timing work immediately (without server-side cron).
  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      if (retentionQueueProcessingRef.current) return;

      const queue = loadRetentionQueue();
      if (queue.length === 0) return;

      const now = Date.now();
      const dueJobs = queue.filter(
        (j) => j.applyAt !== null && j.applyAt <= now,
      );
      if (dueJobs.length === 0) return;

      retentionQueueProcessingRef.current = true;
      let nextQueue = queue;
      let didApplyAny = false;

      try {
        for (const job of dueJobs) {
          try {
            if (job.scope === "file") {
              const canApply = (job.resourceIds ?? []).every((id) =>
                fileCan(id, "delete_files"),
              );
              if (!canApply) continue;
              if (job.action === "move_to_trash") {
                await api.post("/files/bulk-delete", { ids: job.resourceIds });
              } else {
                const results = await Promise.allSettled(
                  job.resourceIds.map((id) =>
                    api.delete(`/files/${id}/permanent`),
                  ),
                );
                const ok = results.every((r) => r.status === "fulfilled");
                if (!ok) throw new Error("Some files permanent-delete failed");
              }
            } else {
              const canApply = (job.resourceIds ?? []).every((id) =>
                folderCan(id, "delete_folders"),
              );
              if (!canApply) continue;
              if (job.action === "move_to_trash") {
                await Promise.all(
                  job.resourceIds.map((id) => api.delete(`/folders/${id}`)),
                );
              } else {
                const results = await Promise.allSettled(
                  job.resourceIds.map((id) =>
                    api.delete(`/folders/${id}/permanent`),
                  ),
                );
                const ok = results.every((r) => r.status === "fulfilled");
                if (!ok)
                  throw new Error("Some folders permanent-delete failed");
              }
            }

            useToast
              .getState()
              .add(
                `Retention applied (${job.scope === "file" ? "file(s)" : "folder(s)"})`,
              );
            didApplyAny = true;
            nextQueue = nextQueue.filter((q) => q.id !== job.id);
          } catch {
            // Keep the job for retry on next interval.
          }
        }

        if (nextQueue.length !== queue.length) {
          saveRetentionQueue(nextQueue);
        }

        if (didApplyAny) {
          queryClient.invalidateQueries({
            queryKey: ["files", folderId ?? "root"],
          });
          queryClient.invalidateQueries({
            queryKey: ["folders", folderId ?? "root"],
          });
          queryClient.invalidateQueries({ queryKey: ["trash"] });
          queryClient.invalidateQueries({ queryKey: ["recent-files"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
          setSelectedFiles([]);
          setSelectedFolders([]);
        }
      } finally {
        retentionQueueProcessingRef.current = false;
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [folderId, queryClient]);

  // Admin notifications for upcoming retention actions (workspace-local).
  // - Starts ~2 days before applyAt
  // - Updates at progressively closer thresholds
  useEffect(() => {
    const role = user?.role ?? "";
    const isAdmin = role === "SUPERADMIN" || role === "ORG_ADMIN";
    if (!isAdmin) return;

    const NOTIF_KEY = "storeit_retention_notifications_v1";
    const thresholds = [
      { key: "2d", ms: 48 * 60 * 60 * 1000 },
      { key: "24h", ms: 24 * 60 * 60 * 1000 },
      { key: "12h", ms: 12 * 60 * 60 * 1000 },
      { key: "6h", ms: 6 * 60 * 60 * 1000 },
      { key: "1h", ms: 60 * 60 * 1000 },
      { key: "15m", ms: 15 * 60 * 1000 },
    ];

    const notifyWindowMs = 10 * 60 * 1000; // 10 minutes

    const shouldNotifyAt = (targetMs: number, nowMs: number) => {
      return nowMs >= targetMs && nowMs <= targetMs + notifyWindowMs;
    };

    const loadNotifState = () => {
      try {
        const raw = localStorage.getItem(NOTIF_KEY);
        if (!raw) return {} as Record<string, Record<string, true>>;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        return parsed as Record<string, Record<string, true>>;
      } catch {
        return {} as Record<string, Record<string, true>>;
      }
    };

    const saveNotifState = (state: Record<string, Record<string, true>>) => {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(state));
    };

    const formatDetailedDateTime = (epochMs: number) =>
      new Date(epochMs).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

    const intervalId = window.setInterval(() => {
      const queue = loadRetentionQueue();
      if (queue.length === 0) return;

      const now = Date.now();
      const remainingNotifState = loadNotifState();
      let changed = false;

      // Clean up notifications for jobs that no longer exist.
      const currentJobIds = new Set(queue.map((j) => j.id));
      for (const jobId of Object.keys(remainingNotifState)) {
        if (!currentJobIds.has(jobId)) {
          delete remainingNotifState[jobId];
          changed = true;
        }
      }

      for (const job of queue) {
        if (job.applyAt === null) continue; // Infinite
        // If job has an explicit per-job reminder configured, use it.
        if (job.reminder && job.reminder !== "none") {
          let notifyAt: number | null = null;
          if (job.reminder === "custom") {
            if (job.reminderAt) notifyAt = job.reminderAt;
          } else {
            const m = String(job.reminder).match(/^(\d+)d$/);
            if (m && job.applyAt) {
              const days = Number(m[1]);
              notifyAt = job.applyAt - days * 24 * 60 * 60 * 1000;
            }
          }

          if (notifyAt !== null) {
            if (shouldNotifyAt(notifyAt, now)) {
              if (remainingNotifState[job.id]?.["reminder"] !== true) {
                const scopeLabel =
                  job.scope === "file" ? "file(s)" : "folder(s)";
                const actionLabel =
                  job.action === "move_to_trash"
                    ? "will be moved to trash"
                    : "will be permanently deleted";
                const count = job.resourceIds?.length ?? 0;
                const when = formatDetailedDateTime(job.applyAt);

                useToast
                  .getState()
                  .add(
                    `Retention: ${count} ${scopeLabel} ${actionLabel} on ${when}. Reminder: ${formatDetailedDateTime(notifyAt)}.`,
                    "info",
                  );

                if (!remainingNotifState[job.id])
                  remainingNotifState[job.id] = {};
                remainingNotifState[job.id]["reminder"] = true;
                changed = true;
              }
            }
          }

          continue; // skip legacy thresholds if a per-job reminder exists
        }

        // FolderIT-style for 7d retention:
        // notifications happen on Day 1 / Day 3 / Day 5, deletion happens on Day 7.
        if (job.retention === "7d") {
          const day1 = job.createdAt + 1 * 24 * 60 * 60 * 1000;
          const day3 = job.createdAt + 3 * 24 * 60 * 60 * 1000;
          const day5 = job.createdAt + 5 * 24 * 60 * 60 * 1000;

          const dayBuckets: Array<{ key: string; at: number; label: string }> =
            [
              { key: "1d", at: day1, label: "Day 1" },
              { key: "3d", at: day3, label: "Day 3" },
              { key: "5d", at: day5, label: "Day 5" },
            ];

          const scopeLabel = job.scope === "file" ? "file(s)" : "folder(s)";
          const actionLabel =
            job.action === "move_to_trash"
              ? "will be moved to trash"
              : "will be permanently deleted";
          const count = job.resourceIds?.length ?? 0;

          if (!remainingNotifState[job.id]) remainingNotifState[job.id] = {};

          for (const b of dayBuckets) {
            if (shouldNotifyAt(b.at, now)) {
              if (remainingNotifState[job.id]?.[b.key] === true) continue;

              useToast
                .getState()
                .add(
                  `Retention: ${count} ${scopeLabel} ${actionLabel} (Day 7 delete: ${formatDetailedDateTime(
                    job.applyAt,
                  )}). Notification: ${b.label} (${formatDetailedDateTime(b.at)}).`,
                  "info",
                );
              remainingNotifState[job.id][b.key] = true;
              changed = true;
            }
          }

          continue; // Skip threshold-based toasts for 7d jobs (prevents duplicates).
        }

        const remainingMs = job.applyAt - now;
        if (remainingMs <= 0) continue; // Due now (scheduler will handle)

        // Determine which threshold bucket we are in.
        // Example: if remaining is 10h -> "12h" bucket.
        let bucketKey: string | null = null;
        for (let i = 0; i < thresholds.length; i++) {
          const cur = thresholds[i];
          const next = thresholds[i + 1];
          if (remainingMs <= cur.ms && (!next || remainingMs > next.ms)) {
            bucketKey = cur.key;
            break;
          }
        }

        if (!bucketKey) continue; // > 48h away

        if (remainingNotifState[job.id]?.[bucketKey] === true) {
          continue;
        }

        const scopeLabel = job.scope === "file" ? "file(s)" : "folder(s)";
        const actionLabel =
          job.action === "move_to_trash"
            ? "will be moved to trash"
            : "will be permanently deleted";
        const count = job.resourceIds?.length ?? 0;
        const when = formatDetailedDateTime(job.applyAt);

        useToast
          .getState()
          .add(
            `Retention: ${count} ${scopeLabel} ${actionLabel} on ${when}.`,
            "info",
          );

        if (!remainingNotifState[job.id]) remainingNotifState[job.id] = {};
        remainingNotifState[job.id][bucketKey] = true;
        changed = true;
      }

      if (changed) saveNotifState(remainingNotifState);
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [user?.role]);

  return (
    <AppShell>
      <div className="flex max-w-6xl mx-auto gap-0 min-h-0">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 transition-all duration-200 w-full">
          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 text-xs text-gray-500 mb-3 pb-1.5 border-b border-gray-100 dark:border-gray-800 flex-wrap">
            <Home size={15} className="shrink-0" />
            <span
              onClick={() => navigate("/browse")}
              className={clsx(
                "cursor-pointer hover:text-gray-800 transition-colors px-0.5 dark:text-white",
                !folderId && "text-gray-800 font-medium pointer-events-none",
              )}
            >
              All Files
            </span>
            {ancestors.map((ancestor, i) => (
              <span key={ancestor.id} className="flex items-center gap-0.5">
                <ChevronRight size={11} className="text-gray-300 shrink-0" />
                <span
                  onClick={() => navigate(`/browse/${ancestor.id}`)}
                  className={clsx(
                    " cursor-pointer hover:text-gray-800 transition-colors px-0.5 truncate max-w-28 dark:text-white",
                    i === ancestors.length - 1
                      ? "text-gray-800 font-medium pointer-events-none"
                      : "hover:text-gray-800",
                  )}
                >
                  {ancestor.name}
                </span>
              </span>
            ))}
          </div>

          {/* Toolbar */}

          {/* Folderit-style action toolbar */}
          <div className="flex items-center gap-0.5 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            {canCreateFolderHere && (
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <FolderPlus size={16} />
                <span className="text-[10px] font-medium">Folder</span>
              </button>
            )}
            <button
              onClick={() => {
                if (!workflowToolbarFile) {
                  setShowWorkflowCenter(true);
                  return;
                }
                setWorkflowPanelFile({
                  id: workflowToolbarFile.id,
                  name: workflowToolbarFile.name,
                });
              }}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <Workflow size={16} />
              <span className="text-[10px] font-medium">Workflow</span>
            </button>
            <div className="relative">
              <button
                onClick={() => {
                  // If a file is already open in the details pane, default Modify
                  // actions to that file (even if nothing is selected).
                  if (
                    selectedFiles.length === 0 &&
                    selectedFolders.length === 0 &&
                    detailFile
                  ) {
                    setSelectedFolders([]);
                    setSelectedFiles([detailFile.id]);
                  }

                  if (
                    selectedFiles.length === 0 &&
                    selectedFolders.length === 0
                  ) {
                    useToast
                      .getState()
                      .add("Select file(s) or folder(s) to use modify actions");
                    return;
                  }
                  if (selectedFiles.length > 0 && selectedFolders.length > 0) {
                    useToast
                      .getState()
                      .add(
                        "Select either files or folders (not both).",
                        "error",
                      );
                    return;
                  }
                  setShowModifyMenu((v) => !v);
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <SquarePen size={16} />
                <span className="text-[10px] font-medium">Modify</span>
              </button>

              {showModifyMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowModifyMenu(false)}
                  />
                  <div
                    className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-40 p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                      {selectedFiles.length > 0 && selectedFolders.length === 0
                        ? `${selectedFiles.length} file${
                            selectedFiles.length !== 1 ? "s" : ""
                          } selected`
                        : selectedFolders.length > 0 &&
                            selectedFiles.length === 0
                          ? `${selectedFolders.length} folder${
                              selectedFolders.length !== 1 ? "s" : ""
                            } selected`
                          : "Select either files or folders"}
                    </div>
                    {/* ── Files mode ── */}
                    {selectedFiles.length > 0 &&
                      selectedFolders.length === 0 && (
                        <>
                          {fileCan(selectedFiles[0], "add_files") && (
                            <button
                              onClick={() => {
                                setShowModifyMenu(false);
                                setMoveFiles(selectedFileObjects);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                            >
                              <FolderInput size={14} /> Move
                            </button>
                          )}

                          {selectedFiles.every((id) =>
                            fileCan(id, "download_files"),
                          ) && (
                            <button
                              onClick={() => {
                                setShowModifyMenu(false);
                                bulkDownload();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                            >
                              <Download size={14} /> Download ZIP
                            </button>
                          )}

                          {selectedFiles.every((id) =>
                            fileCan(id, "delete_files"),
                          ) && (
                            <button
                              onClick={() => {
                                setShowModifyMenu(false);
                                setShowBulkDelete(true);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          )}

                          {selectedFiles.length > 1 &&
                            selectedFiles.every((id) =>
                              fileCan(id, "edit_metadata"),
                            ) && (
                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  openBulkMetadataModal();
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <Info size={14} /> Bulk metadata
                              </button>
                            )}

                          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                          {singleSelectedFile &&
                            fileCan(singleSelectedFile.id, "share_files") && (
                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  handleShare(singleSelectedFile);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <Share2 size={14} /> Permissions
                              </button>
                            )}

                          {singleSelectedFile &&
                            fileCan(
                              singleSelectedFile.id,
                              "edit_file_attrs",
                            ) && (
                              <>
                                <button
                                  onClick={() => {
                                    setShowModifyMenu(false);
                                    setRenameFile(singleSelectedFile);
                                    setRenameName(singleSelectedFile.name);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                >
                                  <SquarePen size={14} /> Rename
                                </button>
                                <button
                                  onClick={() => {
                                    setShowModifyMenu(false);
                                    setTagFile(singleSelectedFile);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                >
                                  <Tag size={14} /> Assign tag
                                </button>
                                <button
                                  onClick={() => {
                                    setShowModifyMenu(false);
                                    setCategoryResource({
                                      id: singleSelectedFile.id,
                                      type: "file",
                                      name: singleSelectedFile.name,
                                      currentCategoryId:
                                        singleSelectedFile.categoryId ?? null,
                                    });
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                >
                                  <Hash size={14} /> Assign category
                                </button>
                              </>
                            )}

                          {singleSelectedFile &&
                            fileCan(singleSelectedFile.id, "edit_metadata") && (
                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  openFileMetadataPage(singleSelectedFile);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <Info size={14} /> Metadata
                              </button>
                            )}

                          {!singleSelectedFile && (
                            <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                              Select exactly 1 file for permissions / rename /
                              tag / category / metadata
                            </div>
                          )}
                        </>
                      )}

                    {/* ── Folders mode ── */}
                    {selectedFolders.length > 0 &&
                      selectedFiles.length === 0 && (
                        <>
                          <button
                            onClick={() => {
                              setShowModifyMenu(false);
                              bulkFolderMove();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            <FolderInput size={14} /> Move
                          </button>

                          <button
                            onClick={() => {
                              setShowModifyMenu(false);
                              bulkFolderDownload();
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            <Download size={14} /> Download ZIP
                          </button>

                          <button
                            onClick={() => {
                              setShowModifyMenu(false);
                              setShowBulkFolderDelete(true);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                          >
                            <Trash2 size={14} /> Delete
                          </button>

                          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                          {singleSelectedFolder && (
                            <>
                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  handleFolderShare(singleSelectedFolder);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <Share2 size={14} /> Permissions
                              </button>

                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  setRenameFolder(singleSelectedFolder);
                                  setRenameFolderName(
                                    singleSelectedFolder.name,
                                  );
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <SquarePen size={14} /> Rename
                              </button>

                              <button
                                onClick={() => {
                                  setShowModifyMenu(false);
                                  setCategoryResource({
                                    id: singleSelectedFolder.id,
                                    type: "folder",
                                    name: singleSelectedFolder.name,
                                    currentCategoryId:
                                      singleSelectedFolder.categoryId ?? null,
                                  });
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                              >
                                <Hash size={14} /> Assign category
                              </button>

                              {folderCan(
                                singleSelectedFolder.id,
                                "edit_metadata",
                              ) && (
                                <button
                                  onClick={() => {
                                    setShowModifyMenu(false);
                                    openFolderMetadataPage(
                                      singleSelectedFolder,
                                    );
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                >
                                  <Info size={14} /> Metadata
                                </button>
                              )}
                            </>
                          )}

                          {!singleSelectedFolder && (
                            <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                              Select exactly 1 folder for permissions / rename /
                              category / metadata
                            </div>
                          )}
                        </>
                      )}
                  </div>
                </>
              )}
            </div>
            {!detailFile && (
              <button
                onClick={() => {
                  if (selectedFiles.length === 1 && singleSelectedFile) {
                    openFileMetadataPage(singleSelectedFile);
                    return;
                  }
                  if (selectedFolders.length === 1 && singleSelectedFolder) {
                    openFolderMetadataPage(singleSelectedFolder);
                    return;
                  }
                  const canManageTemplates = [
                    "ORG_ADMIN",
                    "MANAGER",
                    "SUPERADMIN",
                  ].includes(user?.role ?? "");
                  if (
                    selectedFiles.length === 0 &&
                    selectedFolders.length === 0
                  ) {
                    if (canManageTemplates) {
                      navigate("/admin/templates");
                    } else {
                      useToast
                        .getState()
                        .add(
                          "Select a file or folder to view metadata",
                          "error",
                        );
                    }
                    return;
                  }
                  useToast
                    .getState()
                    .add(
                      "Select exactly 1 file or 1 folder to view metadata",
                      "error",
                    );
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
                title="Metadata"
              >
                <Info size={16} />
                <span className="text-[10px] font-medium">Metadata</span>
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowColumnsMenu((v) => !v)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Columns3 size={16} />
                <span className="text-[10px] font-medium">Columns</span>
              </button>

              {showColumnsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowColumnsMenu(false)}
                  />
                  <div
                    className="absolute left-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-40 p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                      Toggle visible columns (list view)
                    </div>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.type}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            type: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Type
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.size}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            size: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Size
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.modified}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            modified: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Modified
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.version}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            version: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Version
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.approval}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            approval: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Approval
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.retention}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            retention: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Retention
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.lock}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            lock: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Lock
                    </label>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleColumns.metaNotFound}
                        onChange={(e) =>
                          setVisibleColumns((v) => ({
                            ...v,
                            metaNotFound: e.target.checked,
                          }))
                        }
                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                      />
                      Meta not found
                    </label>
                  </div>
                </>
              )}
            </div>
            {canUseMetaToolbar && (
              <button
                onClick={handleMetaToolbar}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Database size={16} />
                <span className="text-[10px] font-medium">Meta</span>
              </button>
            )}
            <button
              onClick={openRetentionToolbar}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <ShieldCheck size={16} />
              <span className="text-[10px] font-medium">Retention</span>
            </button>
            <button
              onClick={() => navigate("/admin/audit")}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <Hash size={16} />
              <span className="text-[10px] font-medium">Audit Log</span>
            </button>
            {(canWrite ||
              fileIds.some((id) => capMap[id]?.add_files === true)) && (
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <Upload size={16} />
                <span className="text-[10px] font-medium">Upload</span>
              </button>
            )}
            <div className="w-px h-7 bg-gray-200 dark:bg-gray-700 mx-1" />
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 gap-0.5 ml-auto">
              <button
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "grid"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400",
                )}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="List view"
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400",
                )}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {/* New Folder dialog */}
          {showNewFolder && (
            <form
              onSubmit={handleCreateFolder}
              className="flex items-center gap-2 mb-4 p-3 bg-pink-50 dark:bg-pink-900/20
               border border-pink-100 dark:border-pink-800 rounded-xl flex-wrap"
            >
              <Folder size={16} className="text-primary-500 shrink-0" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name…"
                className="flex-1 min-w-32 bg-white dark:bg-gray-800 border border-pink-100 dark:border-gray-700
                         dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none
                         focus:ring-2 focus:ring-primary-500 dark:focus:ring-pink-500"
              />
              <select
                value={newFolderCategoryId}
                onChange={(e) => setNewFolderCategoryId(e.target.value)}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-pink-100 dark:border-gray-700
                         dark:text-gray-100 rounded-lg text-sm focus:outline-none
                         focus:ring-2 focus:ring-primary-500 dark:focus:ring-pink-500"
              >
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!newFolderName.trim() || createFolder.isPending}
                className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600
                         dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 transition-colors font-medium"
              >
                {createFolder.isPending ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                  setNewFolderCategoryId("");
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
            </form>
          )}

          {/* Upload zone */}
          {showUpload && (
            <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
              <div className="mb-2 flex items-center justify-end">
                <button
                  onClick={() => setShowUpload(false)}
                  className="inline-flex items-center justify-center rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                  title="Close upload panel"
                  aria-label="Close upload panel"
                >
                  <X size={14} />
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="p-6 text-sm text-gray-500">
                    Loading uploader...
                  </div>
                }
              >
                <UploadZone
                  folderId={folderId}
                  onUploadComplete={handleUploadComplete}
                />
              </Suspense>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedFolders.length > 0 && (
            <div className="mb-4 rounded-xl border border-pink-100 dark:border-pink-800 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-pink-50 dark:bg-pink-900/20">
                <span className="text-sm font-medium text-primary-500 dark:text-pink-400">
                  {selectedFolders.length} folder
                  {selectedFolders.length !== 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  {selectedFolders.every((id) =>
                    folderCan(id, "move_folders"),
                  ) && (
                    <button
                      onClick={bulkFolderMove}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-500 dark:text-pink-400
                               bg-white dark:bg-gray-800 border border-pink-100 dark:border-pink-800 rounded-lg
                               hover:bg-pink-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <FolderInput size={14} /> Move
                    </button>
                  )}
                  {selectedFolders.every((id) =>
                    folderCan(id, "download_folders"),
                  ) && (
                    <button
                      onClick={bulkFolderDownload}
                      disabled={isZippingFolders}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300
                               bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
                               hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                    >
                      {isZippingFolders ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          {zipFoldersProgress === "downloading"
                            ? "Downloading…"
                            : "Zipping…"}
                        </>
                      ) : (
                        <>
                          <Download size={14} /> Download
                        </>
                      )}
                    </button>
                  )}
                  {selectedFolders.every((id) =>
                    folderCan(id, "delete_folders"),
                  ) && (
                    <button
                      onClick={() => setShowBulkFolderDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400
                               bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg
                               hover:bg-red-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedFolders([])}
                    className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedFiles.length > 0 && (
            <div className="mb-4 rounded-xl border border-pink-100 dark:border-pink-800 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-pink-50 dark:bg-pink-900/20">
                <span className="text-sm font-medium text-primary-500 dark:text-pink-400">
                  {selectedFiles.length} selected
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  {selectedFiles.every((id) => fileCan(id, "move_files")) && (
                    <button
                      onClick={() =>
                        setMoveFiles(
                          files.filter((f) => selectedFiles.includes(f.id)),
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-500 dark:text-pink-400
                               bg-white dark:bg-gray-800 border border-pink-100 dark:border-pink-800 rounded-lg
                               hover:bg-pink-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <FolderInput size={14} /> Move
                    </button>
                  )}
                  {selectedFiles.every((id) => fileCan(id, "delete_files")) && (
                    <button
                      onClick={() => setShowBulkDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400
                               bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg
                               hover:bg-red-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  {selectedFiles.every((id) =>
                    fileCan(id, "download_files"),
                  ) && (
                    <button
                      onClick={bulkDownload}
                      disabled={isZipping}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300
                               bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
                               hover:bg-gray-50 dark:hover:bg-gray-700 font-medium disabled:opacity-60
                               disabled:cursor-not-allowed transition-colors"
                    >
                      {isZipping ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      {isZipping
                        ? zipProgress === "downloading"
                          ? "Downloading…"
                          : "Zipping…"
                        : "Download ZIP"}
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {isZipping && (
                <div className="h-1 w-full bg-pink-100 dark:bg-pink-900/40">
                  <div
                    className={clsx(
                      "h-full transition-all duration-500",
                      zipProgress === "downloading"
                        ? "bg-green-500 w-full"
                        : "bg-primary-500 w-2/3 animate-pulse",
                    )}
                  />
                </div>
              )}
              {isZipping && (
                <div className="px-4 py-2 bg-pink-50 dark:bg-pink-900/20 border-t border-pink-100 dark:border-pink-900">
                  <p className="text-xs text-primary-500 dark:text-pink-400 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin shrink-0" />
                    {zipProgress === "downloading"
                      ? "ZIP ready — saving to your device…"
                      : `Building ZIP for ${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}…`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Type filter */}
          {!detailFile && allFiles.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {["all", "pdf", "image", "video", "word", "excel", "zip"].map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                      typeFilter === type
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-500"
                    }`}
                  >
                    {type === "all" ? "All" : type.toUpperCase()}
                  </button>
                ),
              )}
            </div>
          )}

          {/* Pending approvals badge */}
          {!detailFile && workflowInboxItems.length > 0 && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {workflowInboxItems.length} workflow item(s) waiting for your
                approval
              </span>
              <div className="flex gap-1.5 ml-auto flex-wrap">
                {workflowInboxItems.map((item) => (
                  <button
                    key={`${item.workflowId}-${item.file.id}`}
                    onClick={() =>
                      setWorkflowPanelFile({
                        id: item.file.id,
                        name: item.file.name,
                      })
                    }
                    className="text-xs px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 font-medium truncate max-w-35"
                  >
                    Review: {item.file.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main content */}
          {detailFile ? (
            <Suspense
              fallback={
                <div className="p-6 text-sm text-gray-500">
                  Loading details...
                </div>
              }
            >
              <FileDetailsView
                file={detailFile}
                onBack={() => setDetailFile(null)}
                onOpenPreview={(file) => setPreviewFile(file)}
                breadcrumbItems={[
                  { id: "root", label: "All Files", clickable: true },
                  ...ancestors.map((a) => ({
                    id: a.id,
                    label: a.name,
                    clickable: true,
                  })),
                  {
                    id: detailFile.id,
                    label: detailFile.name,
                    clickable: false,
                  },
                ]}
                onBreadcrumbClick={(item) => {
                  if (!item.clickable) return;
                  setDetailFile(null);
                  if (item.id === "root") {
                    navigate("/browse");
                    return;
                  }
                  navigate(`/browse/${item.id}`);
                }}
                retentionLabel={(() => {
                  const job = getCurrentRetentionJobForFile(detailFile.id);
                  if (!job) return "Not set";
                  if (job.applyAt === null) return "Infinite";
                  return new Date(job.applyAt).toLocaleString();
                })()}
                onOpenRetention={(file) => openRetentionDetails(file)}
                onOpenWorkflow={(file) =>
                  setWorkflowPanelFile({ id: file.id, name: file.name })
                }
                onToggleLock={(file) => {
                  const previous = !!file.isLocked;
                  setDetailFile((prev) =>
                    prev && prev.id === file.id
                      ? { ...prev, isLocked: !previous }
                      : prev,
                  );
                  lockMutation.mutate(
                    { fileId: file.id, isLocked: previous },
                    {
                      onError: () => {
                        setDetailFile((prev) =>
                          prev && prev.id === file.id
                            ? { ...prev, isLocked: previous }
                            : prev,
                        );
                      },
                    },
                  );
                }}
                onUploadNewVersion={(file) => handleOpenVersionUpload(file)}
                onOpenVersionHistory={(file) => setVersionsFile(file)}
                canViewMetadata={fileCan(detailFile.id, "view_metadata")}
                canEditMetadata={fileCan(detailFile.id, "edit_metadata")}
                canToggleLock={fileCan(detailFile.id, "edit_file_attrs")}
                canUploadVersion={fileCan(detailFile.id, "update_versions")}
                canOpenWorkflow={fileCan(detailFile.id, "edit_file_attrs")}
                canManageRetention={fileCan(detailFile.id, "delete_files")}
                canManageShare={fileCan(detailFile.id, "share_files")}
                canManageReminders={fileCan(detailFile.id, "edit_file_attrs")}
                isLocking={lockMutation.isPending}
                isUploadingVersion={uploadNewVersionMutation.isPending}
                workflowButtonLabel={
                  detailFile.approvalStatus === "in_review"
                    ? "Open workflow"
                    : "Approval workflow"
                }
              />
            </Suspense>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary-500 dark:border-pink-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isFilteredEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No files match the selected filter.
              </p>
              <button
                onClick={() => setTypeFilter("all")}
                className="mt-3 text-xs text-primary-500 dark:text-pink-400 hover:underline"
              >
                Clear filter
              </button>
            </div>
          ) : isEmpty ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                {!filesLoading &&
                  !foldersLoading &&
                  (filesData?.files?.length ?? 0) === 0 &&
                  (foldersData?.folders?.length ?? 0) === 0 && (
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 bg-pink-50 dark:bg-pink-900/20 rounded-full flex items-center justify-center mb-4">
                        <Upload size={28} className="text-primary-500" />
                      </div>
                      <h3 className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                        This folder is empty
                      </h3>
                      <p className="text-gray-400 text-sm mb-4">
                        {canWrite
                          ? "Upload files or create a folder to get started"
                          : "No files have been shared with you here yet"}
                      </p>
                      {canCreateFolderHere && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowNewFolder(true)}
                            className="text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600
                                         hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors font-medium"
                          >
                            New Folder
                          </button>
                          <button
                            onClick={() => setShowUpload(true)}
                            className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500"
                          >
                            Upload files
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Subfolders */}
              {folders.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Folders ({folders.length})
                    </p>
                    {viewMode === "list" && (
                      <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={
                            folders.length > 0 &&
                            selectedFolders.length === folders.length
                          }
                          onChange={(e) =>
                            setSelectedFolders(
                              e.target.checked ? folders.map((f) => f.id) : [],
                            )
                          }
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                        />
                        Select all
                      </label>
                    )}
                  </div>
                  <div
                    className={clsx(
                      viewMode === "list"
                        ? "flex flex-col gap-3"
                        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3",
                    )}
                  >
                    {folders.map((folder) => {
                      const missingMetaCount = folder.totalMissingMeta ?? 0;
                      return (
                        <div
                          key={folder.id}
                          className={clsx(
                            "relative group",
                            folderMenuId === folder.id && "z-40",
                          )}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            const fromId = e.dataTransfer.getData(
                              "text/storeit-folder-order-id",
                            );
                            reorderFolderItems(fromId, folder.id);
                          }}
                          onMouseLeave={() => {
                            if (folderMenuCloseTimerRef.current) {
                              window.clearTimeout(
                                folderMenuCloseTimerRef.current,
                              );
                            }
                            folderMenuCloseTimerRef.current = window.setTimeout(
                              () => {
                                setFolderMenuId(null);
                              },
                              180,
                            );
                          }}
                          onMouseEnter={() => {
                            if (folderMenuCloseTimerRef.current) {
                              window.clearTimeout(
                                folderMenuCloseTimerRef.current,
                              );
                            }
                          }}
                        >
                          {viewMode === "list" ? (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverFolderId(folder.id);
                              }}
                              onDragLeave={() => setDragOverFolderId(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverFolderId(null);
                                if (draggedFileIds.length > 0) {
                                  dragMove.mutate({
                                    fileIds: draggedFileIds,
                                    targetFolderId: folder.id,
                                  });
                                  setDraggedFileIds([]);
                                }
                              }}
                              className={clsx(
                                "w-full border rounded-xl transition-all text-left flex items-center gap-3 px-3 py-2.5",
                                dragOverFolderId === folder.id
                                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30"
                                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500",
                              )}
                            >
                              <span
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData(
                                    "text/storeit-folder-order-id",
                                    folder.id,
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                                title="Drag to reorder"
                              >
                                <GripVertical size={14} />
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedFolders.includes(folder.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedFolders((prev) =>
                                      prev.includes(folder.id)
                                        ? prev
                                        : [...prev, folder.id],
                                    );
                                  } else {
                                    setSelectedFolders((prev) =>
                                      prev.filter((id) => id !== folder.id),
                                    );
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                              />
                              <button
                                onClick={() => navigate(`/browse/${folder.id}`)}
                                className="flex-1 min-w-0 flex items-center gap-3 text-left"
                              >
                                <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/40 rounded-xl flex items-center justify-center shrink-0 transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-800/60">
                                  <Folder size={16} className="text-blue-500" />
                                </div>
                                <div
                                  className={
                                    missingMetaCount > 0
                                      ? "flex-1 min-w-0 pr-2 grid grid-cols-[1fr_auto] items-start gap-x-2"
                                      : "flex-1 min-w-0 pr-2 flex items-center justify-between gap-2"
                                  }
                                >
                                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                    {folder.name}
                                  </span>
                                  <span
                                    className={`text-xs text-gray-400 shrink-0 ml-3 ${missingMetaCount > 0 ? "row-span-2 self-center" : ""}`}
                                  >
                                    {folder.totalFiles ?? folder._count.files}{" "}
                                    file
                                    {(folder.totalFiles ??
                                      folder._count.files) !== 1
                                      ? "s"
                                      : ""}
                                    {folder._count.children > 0 && (
                                      <>
                                        {" · "}
                                        {folder._count.children} folder
                                        {folder._count.children !== 1
                                          ? "s"
                                          : ""}
                                      </>
                                    )}
                                  </span>
                                  {missingMetaCount > 0 && (
                                    <span
                                      className="inline-flex w-fit max-w-full mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70"
                                      title={`${missingMetaCount} file${missingMetaCount !== 1 ? "s are" : " is"} missing metadata`}
                                    >
                                      {missingMetaCount} file
                                      {missingMetaCount !== 1 ? "s" : ""}{" "}
                                      missing metadata
                                    </span>
                                  )}
                                </div>
                              </button>
                              <div
                                className="flex items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFolderShare(folder);
                                  }}
                                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100
                                       dark:hover:bg-gray-700 text-gray-400 transition-opacity"
                                  title="Permissions"
                                >
                                  <Share2 size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFolderDownload(folder);
                                    setFolderMenuId(null);
                                  }}
                                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100
                                       dark:hover:bg-gray-700 text-gray-400 transition-opacity"
                                  title="Download folder"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFolderMenuId(
                                      folderMenuId === folder.id
                                        ? null
                                        : folder.id,
                                    );
                                  }}
                                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100
                                       dark:hover:bg-gray-700 text-gray-400 transition-opacity"
                                  title="More actions"
                                >
                                  <Settings size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => navigate(`/browse/${folder.id}`)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverFolderId(folder.id);
                              }}
                              onDragLeave={() => setDragOverFolderId(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverFolderId(null);
                                if (draggedFileIds.length > 0) {
                                  dragMove.mutate({
                                    fileIds: draggedFileIds,
                                    targetFolderId: folder.id,
                                  });
                                  setDraggedFileIds([]);
                                }
                              }}
                              className={clsx(
                                "w-full relative border rounded-xl transition-all flex flex-col items-center p-4 hover:shadow-sm text-center",
                                dragOverFolderId === folder.id
                                  ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30 scale-105"
                                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500",
                              )}
                            >
                              <span
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData(
                                    "text/storeit-folder-order-id",
                                    folder.id,
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-2 left-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing"
                                title="Drag to reorder"
                              >
                                <GripVertical size={13} />
                              </span>
                              <div
                                className={clsx(
                                  "bg-blue-50 dark:bg-blue-900/40 rounded-xl flex items-center justify-center shrink-0 transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-800/60",
                                  "w-12 h-12 mb-3",
                                )}
                              >
                                <Folder size={22} className="text-blue-500" />
                              </div>
                              <div className="w-full">
                                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center block">
                                  {folder.name}
                                </span>
                                <span className="text-xs text-gray-400 shrink-0 mt-1 block">
                                  {folder.totalFiles ?? folder._count.files}{" "}
                                  file
                                  {(folder.totalFiles ??
                                    folder._count.files) !== 1
                                    ? "s"
                                    : ""}
                                  {folder._count.children > 0 && (
                                    <>
                                      {" · "}
                                      {folder._count.children} folder
                                      {folder._count.children !== 1 ? "s" : ""}
                                    </>
                                  )}
                                </span>
                                {missingMetaCount > 0 && (
                                  <span
                                    className="inline-flex w-fit max-w-full mt-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70"
                                    title={`${missingMetaCount} file${missingMetaCount !== 1 ? "s are" : " is"} missing metadata`}
                                  >
                                    {missingMetaCount} missing metadata
                                  </span>
                                )}
                                {missingMetaCount === 0 && (
                                  <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border border-transparent invisible">
                                    0 missing metadata
                                  </span>
                                )}
                              </div>
                            </button>
                          )}
                          {/* Grid view: icon buttons on hover */}
                          {viewMode === "grid" && (
                            <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFolderAssignCategory(folder);
                                }}
                                className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
                                       text-gray-400 hover:text-purple-600 dark:hover:text-purple-400
                                       hover:border-purple-300 dark:hover:border-purple-500 shadow-sm transition-colors"
                                title="Assign category"
                              >
                                <Hash size={12} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      `Delete folder "${folder.name}" and all its contents?`,
                                    )
                                  ) {
                                    api
                                      .delete(`/folders/${folder.id}`)
                                      .then(() => {
                                        queryClient.invalidateQueries({
                                          queryKey: [
                                            "folders",
                                            folderId ?? "root",
                                          ],
                                        });
                                        queryClient.invalidateQueries({
                                          queryKey: ["folders", "root"],
                                        });
                                      })
                                      .catch(() =>
                                        useToast
                                          .getState()
                                          .add(
                                            "Failed to delete folder",
                                            "error",
                                          ),
                                      );
                                  }
                                }}
                                className="p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
                                       text-gray-400 hover:text-red-600 dark:hover:text-red-400
                                       hover:border-red-300 dark:hover:border-red-500 shadow-sm transition-colors"
                                title="Delete folder"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}

                          {/* List view: settings menu popup */}
                          {viewMode === "list" && (
                            <div
                              className="absolute right-2 top-1/2 -translate-y-1/2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {folderMenuId === folder.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setFolderMenuId(null)}
                                  />
                                  <div
                                    className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-900
                                              border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-1"
                                    onMouseEnter={() => {
                                      if (folderMenuCloseTimerRef.current) {
                                        window.clearTimeout(
                                          folderMenuCloseTimerRef.current,
                                        );
                                      }
                                    }}
                                    onMouseLeave={() => setFolderMenuId(null)}
                                  >
                                    <button
                                      onClick={() => {
                                        handleFolderAssignCategory(folder);
                                        setFolderMenuId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700
                                             dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                    >
                                      <Hash size={14} /> Assign category
                                    </button>

                                    <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                                      <button
                                        onClick={() => {
                                          handleFolderShare(folder);
                                          setFolderMenuId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700
                                               dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                      >
                                        <Share2 size={14} /> Share permissions
                                      </button>
                                      <button
                                        onClick={async () => {
                                          await handleFolderDownload(folder);
                                          setFolderMenuId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700
                                               dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                      >
                                        <Download size={14} /> Download ZIP
                                      </button>
                                      {folderCan(
                                        folder.id,
                                        "edit_metadata",
                                      ) && (
                                        <button
                                          onClick={() => {
                                            openFolderMetadataPage(folder);
                                            setFolderMenuId(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700
                                               dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                        >
                                          <Database size={14} /> Meta
                                        </button>
                                      )}
                                    </div>
                                    <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                                      <button
                                        onClick={() => {
                                          setFolderMenuId(null);
                                          if (
                                            confirm(
                                              `Delete folder "${folder.name}" and all its contents?`,
                                            )
                                          ) {
                                            api
                                              .delete(`/folders/${folder.id}`)
                                              .then(() => {
                                                queryClient.invalidateQueries({
                                                  queryKey: [
                                                    "folders",
                                                    folderId ?? "root",
                                                  ],
                                                });
                                                queryClient.invalidateQueries({
                                                  queryKey: ["folders", "root"],
                                                });
                                              })
                                              .catch(() =>
                                                useToast
                                                  .getState()
                                                  .add(
                                                    "Failed to delete folder",
                                                    "error",
                                                  ),
                                              );
                                          }
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600
                                               dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                                      >
                                        <Trash2 size={14} /> Delete
                                      </button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files */}
              {files.length > 0 && (
                <div>
                  {folders.length > 0 && (
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                      Files ({files.length})
                    </p>
                  )}
                  {viewMode === "grid" ? (
                    <FileGrid
                      files={files}
                      onFileClick={handleFileClick}
                      onStar={handleStarFile}
                      onDragStart={handleFileDragStart}
                      onDragEnd={handleFileDragEnd}
                      onReorder={reorderFileItems}
                    />
                  ) : (
                    <FileList
                      files={files}
                      onFileClick={handleFileClick}
                      onDelete={handleDelete}
                      onShare={handleShare}
                      onVersions={handleVersions}
                      onMove={handleMove}
                      onStar={handleStarFile}
                      onRename={handleRenameFileOpen}
                      selectedIds={selectedFiles}
                      onSelectChange={setSelectedFiles}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onDragStart={handleFileDragStart}
                      onDragEnd={handleFileDragEnd}
                      onMetadata={openFileMetadataPage}
                      onComments={handleCommentsOpen}
                      onSubmitApproval={handleSubmitApprovalOpen}
                      onLock={handleLockFile}
                      onAssignCategory={handleAssignCategoryFile}
                      onAssignTag={handleAssignTagFile}
                      onApprovalDetail={handleApprovalDetailOpen}
                      capabilitiesMap={capMap}
                      visibleColumns={visibleColumns}
                      onRetentionClick={openRetentionDetails}
                      preserveOrder={sortBy === "manual"}
                      onReorder={reorderFileItems}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {renameFile && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-xl p-6 w-96 shadow-xl">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Rename file
                </h3>
                <input
                  autoFocus
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-4
                           focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    renameMutation.mutate({
                      id: renameFile.id,
                      name: renameName,
                    })
                  }
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setRenameFile(null)}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      renameMutation.mutate({
                        id: renameFile.id,
                        name: renameName,
                      })
                    }
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    Rename
                  </button>
                </div>
              </div>
            </div>
          )}

          {renameFolder && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-xl p-6 w-96 shadow-xl">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Rename folder
                </h3>
                <input
                  autoFocus
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm mb-4
                           focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    renameFolderMutation.mutate({
                      id: renameFolder.id,
                      name: renameFolderName,
                    })
                  }
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setRenameFolder(null)}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      renameFolderMutation.mutate({
                        id: renameFolder.id,
                        name: renameFolderName,
                      })
                    }
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    Rename
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        {previewFile && (
          <FileDocumentPreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        )}
        <input
          ref={versionFileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            handleVersionFileSelected(selected);
            e.currentTarget.value = "";
          }}
        />
        {permissionsResource && (
          <PermissionsPanel
            resourceId={permissionsResource.id}
            resourceType={permissionsResource.type}
            resourceName={permissionsResource.name}
            onClose={() => setPermissionsResource(null)}
          />
        )}
        {versionsFile && (
          <FileVersionsModal
            file={versionsFile}
            canRestore={fileCan(versionsFile.id, "update_versions")}
            canView={fileCan(versionsFile.id, "preview_files")}
            onClose={() => setVersionsFile(null)}
          />
        )}
        {moveFiles.length > 0 && (
          <MoveFileModal
            files={moveFiles}
            onClose={() => setMoveFiles([])}
            onSuccess={(targetFolderId, movedFileIds) => {
              applyImmediateMoveResult(movedFileIds, targetFolderId);
              invalidateBrowserQueries();
              setSelectedFiles((prev) =>
                prev.filter((id) => !movedFileIds.includes(id)),
              );
            }}
          />
        )}
        {moveFolders.length > 0 && (
          <MoveFolderModal
            folders={moveFolders.map((f) => ({ id: f.id, name: f.name }))}
            onClose={() => setMoveFolders([])}
            onSuccess={(targetParentId, movedFolderIds) => {
              const movedCount = movedFolderIds.length;
              // Update children counts optimistically in both caches
              const updateChildren = (folders: StoreItem[]) =>
                folders.map((folder) => {
                  if (folder.id === targetParentId) {
                    return {
                      ...folder,
                      _count: {
                        ...folder._count,
                        children: folder._count.children + movedCount,
                      },
                    };
                  }
                  if (folder.id === (folderId ?? null)) {
                    return {
                      ...folder,
                      _count: {
                        ...folder._count,
                        children: Math.max(
                          0,
                          folder._count.children - movedCount,
                        ),
                      },
                    };
                  }
                  return folder;
                });

              queryClient.setQueryData<{ folders: StoreItem[] }>(
                ["folders", folderId ?? "root"],
                (current) =>
                  current
                    ? { ...current, folders: updateChildren(current.folders) }
                    : current,
              );
              queryClient.setQueryData<{ folders: StoreItem[] }>(
                ["folders", "all"],
                (current) =>
                  current
                    ? { ...current, folders: updateChildren(current.folders) }
                    : current,
              );

              invalidateBrowserQueries();
              setSelectedFolders([]);
              setMoveFolders([]);
            }}
          />
        )}
        {categoryResource && (
          <AssignCategoryModal
            resourceId={categoryResource.id}
            resourceType={categoryResource.type}
            resourceName={categoryResource.name}
            currentCategoryId={categoryResource.currentCategoryId}
            onClose={() => setCategoryResource(null)}
          />
        )}
        {/* ── Tag modal — opened from FileList onAssignTag ── */}
        {tagFile && (
          <AssignTagModal file={tagFile} onClose={() => setTagFile(null)} />
        )}
        {commentsFile && (
          <FileCommentsPanel
            fileId={commentsFile.id}
            fileName={commentsFile.name}
            onClose={() => setCommentsFile(null)}
          />
        )}

        {workflowComposerFile && (
          <ApprovalWorkflowComposerModal
            file={workflowComposerFile}
            initialApproverUserIds={workflowTemplateApproverIds}
            onClose={() => {
              setWorkflowComposerFile(null);
              setWorkflowTemplateApproverIds([]);
            }}
            onSuccess={(workflow) => {
              patchDetailWorkflowState(workflow);
              setWorkflowPanelFile(workflowComposerFile);
            }}
          />
        )}

        {showWorkflowCenter && (
          <ApprovalWorkflowCenterPanel
            onClose={() => setShowWorkflowCenter(false)}
            onOpenWorkflow={(file) => {
              setShowWorkflowCenter(false);
              setWorkflowPanelFile(file);
            }}
          />
        )}

        {workflowPanelFile && (
          <ApprovalWorkflowPanel
            file={workflowPanelFile}
            onClose={() => setWorkflowPanelFile(null)}
            canStartWorkflow={fileCan(workflowPanelFile.id, "edit_file_attrs")}
            onStartWorkflow={
              fileCan(workflowPanelFile.id, "edit_file_attrs")
                ? (templateApproverUserIds) => {
                    setWorkflowPanelFile(null);
                    openWorkflowComposer(
                      workflowPanelFile,
                      templateApproverUserIds ?? [],
                    );
                  }
                : undefined
            }
            onWorkflowChanged={(workflow) => {
              patchDetailWorkflowState(workflow);
            }}
          />
        )}

        {approvalFile && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-6 shadow-xl">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                Review approval
              </h3>
              <p className="text-sm text-gray-500 mb-4 truncate">
                {approvalFile.name}
              </p>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Optional note…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4
                         dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setApprovalFile(null);
                    setApprovalNote("");
                  }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    approveMutation.mutate({
                      fileId: approvalFile.id,
                      action: "rejected",
                      note: approvalNote,
                    })
                  }
                  className="px-4 py-2 text-sm bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-100
                           dark:hover:bg-red-900/50 font-medium"
                >
                  Reject
                </button>
                <button
                  onClick={() =>
                    approveMutation.mutate({
                      fileId: approvalFile.id,
                      action: "approved",
                      note: approvalNote,
                    })
                  }
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700
                           dark:bg-green-500 dark:hover:bg-green-600 font-medium"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {approvalDetailFile && (
          <ApprovalDetailPanel
            file={approvalDetailFile}
            onClose={() => setApprovalDetailFile(null)}
            onResubmit={() =>
              submitApprovalMutation.mutate(approvalDetailFile.id)
            }
          />
        )}

        {showRetentionDetailsModal && (
          <RetentionDetailsModal
            file={
              retentionDetailsFile
                ? {
                    id: retentionDetailsFile.id,
                    name: retentionDetailsFile.name,
                  }
                : null
            }
            job={retentionDetailsJob}
            onClose={() => setShowRetentionDetailsModal(false)}
            onEdit={handleEditRetention}
          />
        )}

        {showRetentionModal && (
          <RetentionModal
            key={retentionModalNonce}
            scope={retentionScope}
            count={
              retentionScope === "file"
                ? selectedFiles.length
                : selectedFolders.length
            }
            onClose={() => {
              setShowRetentionModal(false);
              setRetentionEditJobId(null);
              setRetentionModalInitialValues(null);
            }}
            onConfirm={applyRetention}
            isConfirming={isApplyingRetention}
            initialValues={retentionModalInitialValues ?? undefined}
          />
        )}
      </Suspense>

      {showBulkMetadataModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl w-full max-w-xl">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Bulk metadata
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Apply metadata to {selectedFiles.length} selected files
              </p>
            </div>
            <div className="p-5 space-y-2 max-h-[55vh] overflow-y-auto">
              {bulkMetadataFields.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    value={row.key}
                    onChange={(e) =>
                      setBulkMetadataFields((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, key: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Key"
                    className="col-span-4 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <input
                    value={row.value}
                    onChange={(e) =>
                      setBulkMetadataFields((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Value"
                    className="col-span-6 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={() =>
                      setBulkMetadataFields((prev) =>
                        prev.length === 1
                          ? prev
                          : prev.filter((_, i) => i !== idx),
                      )
                    }
                    className="col-span-2 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setBulkMetadataFields((prev) => [
                    ...prev,
                    { key: "", value: "" },
                  ])
                }
                className="text-xs text-primary-600 dark:text-pink-400 hover:underline"
              >
                + Add field
              </button>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBulkMetadataModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={bulkMetadataMutation.isPending}
                onClick={() => {
                  const fields = bulkMetadataFields
                    .map((f) => ({ key: f.key.trim(), value: f.value }))
                    .filter((f) => f.key.length > 0);
                  if (fields.length === 0) {
                    useToast
                      .getState()
                      .add("Add at least one metadata key", "error");
                    return;
                  }
                  bulkMetadataMutation.mutate({ ids: selectedFiles, fields });
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
              >
                {bulkMetadataMutation.isPending ? "Applying..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modals */}
      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete File"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? It will be moved to the trash.`}
        isLoading={isDeleting}
      />

      <DeleteModal
        isOpen={showBulkDelete}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={() => {
          setShowBulkDelete(false);
          bulkDelete.mutate(selectedFiles);
        }}
        title="Delete Multiple Files"
        message={`Are you sure you want to delete ${selectedFiles.length} files? They will be moved to the trash.`}
        isLoading={bulkDelete.isPending}
      />

      <DeleteModal
        isOpen={showBulkFolderDelete}
        onClose={() => setShowBulkFolderDelete(false)}
        onConfirm={bulkFolderDelete}
        title="Delete Multiple Folders"
        message={`Are you sure you want to delete ${selectedFolders.length} folders? Their contents will also be moved to trash.`}
        isLoading={isDeletingFolders}
      />
    </AppShell>
  );
}
