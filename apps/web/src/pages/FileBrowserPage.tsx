import { useEffect, useRef, useState } from "react";
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
  Workflow,
  ChevronRight,
  Home,
  Trash2,
  Hash,
  FolderInput,
  Download,
  Loader2,
  Settings,
  Share2,
  Tag,
  Info,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FileGrid from "../components/files/FileGrid";
import FileList from "../components/files/FileList";
import UploadZone from "../components/files/UploadZone";
import FilePreviewModal from "../components/files/FilePreviewModal";
import PermissionsPanel from "../components/permissions/PermissionsPanel";
import clsx from "clsx";
import api from "../api/axios";
import FileVersionsModal from "../components/files/FileVersionsModal";
import MoveFileModal from "../components/files/MoveFileModal";
import AssignCategoryModal from "../components/files/AssignCategoryModal";
import AssignTagModal from "../components/files/AssignTagModal.tsx";
import { useToast } from "../components/ui/Toast";
import FileMetadataPanel from "../components/files/FileMetadataPanel";
import FileCommentsPanel from "../components/files/FileCommentsPanel";
import { useAuthStore } from "../store/authStore";
import ApprovalDetailPanel from "../components/files/ApprovalDetailPanel";
import { useFileCapabilities } from "../hooks/useFileCapabilities";
import DeleteModal from "../components/common/DeleteModal";

type ViewMode = "grid" | "list";

interface StoreITem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { files: number; children: number };
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
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [metadataFile, setMetadataFile] = useState<any>(null);
  const [permissionsResource, setPermissionsResource] = useState<{
    id: string;
    type: "file" | "folder";
    name: string;
  } | null>(null);
  const [versionsFile, setVersionsFile] = useState<any>(null);
  const handleVersions = (file: any) => setVersionsFile(file);
  const [moveFiles, setMoveFiles] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [newFolderCategoryId, setNewFolderCategoryId] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    "name" | "size" | "createdAt" | "mimeType"
  >("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  const folderMenuCloseTimerRef = useRef<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [commentsFile, setCommentsFile] = useState<any>(null);
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
  const [approvalFile, setApprovalFile] = useState<any>(null);
  const [renameName, setRenameName] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalDetailFile, setApprovalDetailFile] = useState<any>(null);

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showBulkFolderDelete, setShowBulkFolderDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingFolders, setIsDeletingFolders] = useState(false);
  const [showModifyMenu, setShowModifyMenu] = useState(false);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    type: true,
    size: true,
    modified: true,
  });

  // ── Tag modal state ───────────────────────────────────────────────────────
  // Stores the full file object so AssignTagModal can read its current tags
  const [tagFile, setTagFile] = useState<any>(null);

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
      if (renameFile) {
        setRenameFile(null);
        return;
      }
      if (tagFile) {
        setTagFile(null);
        return;
      }
      if (metadataFile) {
        setMetadataFile(null);
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
    renameFile,
    tagFile,
    metadataFile,
    commentsFile,
    versionsFile,
    previewFile,
    permissionsResource,
    moveFiles,
    categoryResource,
    showUpload,
    showNewFolder,
    approvalNote,
  ]);

  useEffect(() => {
    return () => {
      if (folderMenuCloseTimerRef.current) {
        window.clearTimeout(folderMenuCloseTimerRef.current);
      }
    };
  }, []);

  // ── Fetch files ───────────────────────────────────────────────────────────
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["files", folderId ?? "root"],
    queryFn: async () => {
      const res = await api.get("/files", { params: { folderId } });
      return res.data as { files: any[] };
    },
  });
  const { user } = useAuthStore();
  const canWrite = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"].includes(
    user?.role ?? "",
  );

  // ── Granular per-file capabilities for VIEWER role ───────────────────────
  const fileIds = (filesData?.files ?? []).map((f: any) => f.id as string);
  const { capMap } = useFileCapabilities(fileIds);

  // ── Fetch subfolders ──────────────────────────────────────────────────────
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ["folders", folderId ?? "root"],
    queryFn: async () => {
      const res = await api.get("/folders", {
        params: { parentId: folderId ?? null },
      });
      return res.data as { folders: StoreITem[] };
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

  const starMutation = useMutation({
    mutationFn: async (file: any) => {
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
      return res.data as { categories: any[] };
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
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["folders", folderId ?? "root"],
      });
      queryClient.invalidateQueries({ queryKey: ["folders", "root"] });
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
          onDownloadProgress: () =>
            setZipFoldersProgress("downloading"),
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
    useToast
      .getState()
      .add(
        "Bulk folder move will be added once folder move API is available",
      );
  };

  const bulkFolderDelete = async () => {
    if (selectedFolders.length === 0) return;
    setIsDeletingFolders(true);
    try {
      await Promise.all(selectedFolders.map((id) => api.delete(`/folders/${id}`)));
      queryClient.invalidateQueries({ queryKey: ["folders", folderId ?? "root"] });
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

  // FIX: renamed inner param to targetFolderId to avoid shadowing useParams folderId
  const dragMove = useMutation({
    mutationFn: async ({
      fileId,
      targetFolderId,
    }: {
      fileId: string;
      targetFolderId: string;
    }) => api.patch(`/files/${fileId}/move`, { folderId: targetFolderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
      useToast.getState().add("File moved");
    },
    onError: () => useToast.getState().add("Failed to move file", "error"),
  });

  const allFiles = filesData?.files ?? [];
  const files = allFiles.filter((f) => {
    if (typeFilter === "all") return true;
    if (typeFilter === "pdf") return f.mimeType.includes("pdf");
    if (typeFilter === "image") return f.mimeType.startsWith("image/");
    if (typeFilter === "video") return f.mimeType.startsWith("video/");
    if (typeFilter === "word")
      return (
        f.mimeType.includes("msword") || f.mimeType.includes("wordprocessingml")
      );
    if (typeFilter === "excel")
      return (
        f.mimeType.includes("excel") || f.mimeType.includes("spreadsheetml")
      );
    if (typeFilter === "zip")
      return f.mimeType.includes("zip") || f.mimeType.includes("compressed");
    return true;
  });
  const folders = foldersData?.folders ?? [];
  const isLoading = filesLoading || foldersLoading;
  const isFilteredEmpty =
    files.length === 0 && allFiles.length > 0 && typeFilter !== "all";
  const isEmpty = allFiles.length === 0 && folders.length === 0;

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["files", folderId ?? "root"] });
  };

  const handleFileClick = (file: any) => setPreviewFile(file);
  const handleShare = (file: any) => {
    setPermissionsResource({ id: file.id, type: "file", name: file.name });
  };
  const handleFolderShare = (folder: StoreITem) => {
    setPermissionsResource({
      id: folder.id,
      type: "folder",
      name: folder.name,
    });
  };
  const handleFolderDownload = async (folder: StoreITem) => {
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
  const handleSort = (col: "name" | "size" | "createdAt" | "mimeType") => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  };
  const handleDelete = (file: any) => setDeleteTarget(file);

  const fileCan = (fileId: string, cap: string) =>
    canWrite || capMap[fileId]?.[cap] === true;

  const selectedFileObjects = files.filter((f) => selectedFiles.includes(f.id));
  const singleSelectedFile =
    selectedFiles.length === 1
      ? files.find((f) => f.id === selectedFiles[0])
      : null;

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
    } catch (e: any) {
      if (e.response?.data?.error) {
        useToast.getState().add(e.response.data.error, "error");
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
    createFolder.mutate(newFolderName.trim());
  };
  const handleMove = (file: any) => setMoveFiles([file]);
  const handleFolderAssignCategory = (folder: any) =>
    setCategoryResource({
      id: folder.id,
      type: "folder",
      name: folder.name,
      currentCategoryId: folder.categoryId,
    });

  const handleMetaToolbar = () => {
    if (selectedFiles.length === 0) {
      useToast.getState().add("Select a file to edit metadata");
      return;
    }
    if (selectedFiles.length !== 1 || !singleSelectedFile) {
      useToast
        .getState()
        .add("Select exactly one file to edit metadata", "error");
      return;
    }
    if (!fileCan(singleSelectedFile.id, "edit_file_attrs")) {
      useToast.getState().add("You don't have permission to edit metadata", "error");
      return;
    }
    setShowModifyMenu(false);
    setShowColumnsMenu(false);
    setMetadataFile(singleSelectedFile);
  };

  return (
    <AppShell>
      <div className="flex max-w-6xl mx-auto gap-0 min-h-0">
        <div
          className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 transition-all duration-200 ${metadataFile ? "flex-1 min-w-0 rounded-r-none border-r-0" : "w-full"}`}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800 flex-wrap">
            <Home size={18} className="shrink-0" />
            <span
              onClick={() => navigate("/browse")}
              className={clsx(
                "cursor-pointer hover:text-gray-800 transition-colors px-1 dark:text-white",
                !folderId && "text-gray-800 font-medium pointer-events-none",
              )}
            >
              All Files
            </span>
            {ancestors.map((ancestor, i) => (
              <span key={ancestor.id} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-gray-300 shrink-0" />
                <span
                  onClick={() => navigate(`/browse/${ancestor.id}`)}
                  className={clsx(
                    "cursor-pointer hover:text-gray-800 transition-colors px-1 truncate max-w-[140px]",
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
            {canWrite && (
              <button
                onClick={() => setShowNewFolder(true)}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
              >
                <FolderPlus size={16} />
                <span className="text-[10px] font-medium">Folder</span>
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => {
                  if (selectedFiles.length === 0) {
                    useToast
                      .getState()
                      .add("Select file(s) to use modify actions");
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
                      {selectedFiles.length} file
                      {selectedFiles.length !== 1 ? "s" : ""} selected
                    </div>

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

                    {selectedFiles.every((id) => fileCan(id, "download_files")) && (
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

                    {selectedFiles.every((id) => fileCan(id, "delete_files")) && (
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
                      fileCan(singleSelectedFile.id, "edit_file_attrs") && (
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
                                  (singleSelectedFile as any).categoryId ?? null,
                              });
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            <Hash size={14} /> Assign category
                          </button>
                          <button
                            onClick={() => {
                              setShowModifyMenu(false);
                              setMetadataFile(singleSelectedFile);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            <Info size={14} /> Metadata
                          </button>
                        </>
                      )}

                    {!singleSelectedFile && (
                      <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                        Select exactly 1 file for permissions / rename / tag /
                        category / metadata
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
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
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleMetaToolbar}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <Database size={16} />
              <span className="text-[10px] font-medium">Meta</span>
            </button>
            <button
              onClick={() =>
                useToast
                  .getState()
                  .add("Retention policies will be configurable soon")
              }
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <ShieldCheck size={16} />
              <span className="text-[10px] font-medium">Retention</span>
            </button>
            <button
              onClick={() =>
                useToast.getState().add("Workflow actions are coming next")
              }
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <Workflow size={16} />
              <span className="text-[10px] font-medium">Workflow</span>
            </button>
            <button
              onClick={() => navigate("/admin/audit")}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <Hash size={16} />
              <span className="text-[10px] font-medium">Audit Log</span>
            </button>
            <button
              onClick={() =>
                useToast
                  .getState()
                  .add("Numbering rules will be available in next update")
              }
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
            >
              <Hash size={16} />
              <span className="text-[10px] font-medium">Numbering</span>
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
            <div className="mb-6">
              <UploadZone
                folderId={folderId}
                onUploadComplete={handleUploadComplete}
              />
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
                  {canWrite && (
                    <button
                      onClick={bulkFolderMove}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-500 dark:text-pink-400
                               bg-white dark:bg-gray-800 border border-pink-100 dark:border-pink-800 rounded-lg
                               hover:bg-pink-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <FolderInput size={14} /> Move
                    </button>
                  )}
                  {canWrite && (
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
                  {canWrite && (
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
                  {canWrite && (
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
                  {canWrite && (
                    <button
                      onClick={() => setShowBulkDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 dark:text-red-400
                               bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg
                               hover:bg-red-50 dark:hover:bg-gray-700 font-medium"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  {canWrite && (
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
          {allFiles.length > 0 && (
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
          {(user?.role === "ORG_ADMIN" ||
            user?.role === "MANAGER" ||
            user?.role === "SUPERADMIN") &&
            files.some((f) => f.approvalStatus === "pending") && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                  {files.filter((f) => f.approvalStatus === "pending").length}{" "}
                  file(s) pending approval
                </span>
                <div className="flex gap-1.5 ml-auto flex-wrap">
                  {files
                    .filter((f) => f.approvalStatus === "pending")
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setApprovalFile(f)}
                        className="text-xs px-2.5 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 font-medium truncate max-w-[140px]"
                      >
                        Review: {f.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

          {/* Main content */}
          {isLoading ? (
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
                      {canWrite && (
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
                            className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 dark:bg-primary-500 dark:hover:bg-primary-600"
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
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        className={clsx(
                          "relative group",
                          folderMenuId === folder.id && "z-40",
                        )}
                        onMouseLeave={() => {
                          if (folderMenuCloseTimerRef.current) {
                            window.clearTimeout(folderMenuCloseTimerRef.current);
                          }
                          folderMenuCloseTimerRef.current = window.setTimeout(() => {
                            setFolderMenuId(null);
                          }, 180);
                        }}
                        onMouseEnter={() => {
                          if (folderMenuCloseTimerRef.current) {
                            window.clearTimeout(folderMenuCloseTimerRef.current);
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
                              if (draggedFileId) {
                                dragMove.mutate({
                                  fileId: draggedFileId,
                                  targetFolderId: folder.id,
                                });
                                setDraggedFileId(null);
                              }
                            }}
                            className={clsx(
                              "w-full border rounded-xl transition-all text-left flex items-center gap-3 px-3 py-2.5",
                              dragOverFolderId === folder.id
                                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500",
                            )}
                          >
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
                              <div className="flex-1 min-w-0 flex items-center justify-between pr-2">
                                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                  {folder.name}
                                </span>
                                <span className="text-xs text-gray-400 shrink-0 ml-3">
                                  {folder._count.files} file
                                  {folder._count.files !== 1 ? "s" : ""}
                                </span>
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
                                    folderMenuId === folder.id ? null : folder.id,
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
                              if (draggedFileId) {
                                dragMove.mutate({
                                  fileId: draggedFileId,
                                  targetFolderId: folder.id,
                                });
                                setDraggedFileId(null);
                              }
                            }}
                            className={clsx(
                              "w-full border rounded-xl transition-all flex flex-col items-center p-4 hover:shadow-sm text-center",
                              dragOverFolderId === folder.id
                                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30 scale-105"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500",
                            )}
                          >
                          <div
                            className={clsx(
                              "bg-blue-50 dark:bg-blue-900/40 rounded-xl flex items-center justify-center shrink-0 transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-800/60",
                              "w-12 h-12 mb-3",
                            )}
                          >
                            <Folder size={22} className="text-blue-500" />
                          </div>
                          <div className="w-full">
                            <span
                              className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center block"
                            >
                              {folder.name}
                            </span>
                            <span
                              className="text-xs text-gray-400 shrink-0 mt-1 block"
                            >
                              {folder._count.files} file
                              {folder._count.files !== 1 ? "s" : ""}
                            </span>
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
                    ))}
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
                      onStar={(file) => starMutation.mutate(file)}
                    />
                  ) : (
                    <FileList
                      files={files}
                      onFileClick={handleFileClick}
                      onDelete={handleDelete}
                      onShare={handleShare}
                      onVersions={handleVersions}
                      onMove={handleMove}
                      onStar={(file) => starMutation.mutate(file)}
                      onRename={(file) => {
                        setRenameFile(file);
                        setRenameName(file.name);
                      }}
                      selectedIds={selectedFiles}
                      onSelectChange={setSelectedFiles}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      onDragStart={(file) => setDraggedFileId(file.id)}
                      onDragEnd={() => setDraggedFileId(null)}
                      onMetadata={(file) => setMetadataFile(file)}
                      onComments={(file) => setCommentsFile(file)}
                      onSubmitApproval={(file) =>
                        submitApprovalMutation.mutate(file.id)
                      }
                      onLock={(file) =>
                        lockMutation.mutate({
                          fileId: file.id,
                          isLocked: !!file.isLocked,
                        })
                      }
                      onAssignCategory={(file) =>
                        setCategoryResource({
                          id: file.id,
                          type: "file",
                          name: file.name,
                          currentCategoryId: file.categoryId ?? null,
                        })
                      }
                      onAssignTag={(file) => setTagFile(file)}
                      onApprovalDetail={(file) => setApprovalDetailFile(file)}
                      capabilitiesMap={capMap}
                      visibleColumns={visibleColumns}
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
        </div>

        {/* ── Inline Metadata Side Panel ── */}
        {metadataFile && (
          <FileMetadataPanel
            fileId={metadataFile.id}
            fileName={metadataFile.name}
            onClose={() => setMetadataFile(null)}
          />
        )}
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
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
          onClose={() => setVersionsFile(null)}
        />
      )}
      {moveFiles.length > 0 && (
        <MoveFileModal
          files={moveFiles}
          onClose={() => setMoveFiles([])}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["files", folderId ?? "root"],
            });
            setSelectedFiles([]);
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
