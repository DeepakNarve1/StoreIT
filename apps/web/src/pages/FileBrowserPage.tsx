import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  LayoutGrid,
  List,
  Upload,
  FolderPlus,
  Folder,
  ChevronRight,
  Home,
  Trash2,
  Hash,
  FolderInput,
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
import { useToast } from "../components/ui/Toast";

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
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [permissionsResource, setPermissionsResource] = useState<{
    id: string;
    type: "file" | "folder";
    name: string;
  } | null>(null);
  const [versionsFile, setVersionsFile] = useState<any>(null);
  const handleVersions = (file: any) => setVersionsFile(file);
  const [moveFiles, setMoveFiles] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [newFolderCategoryId, setNewFolderCategoryId] = useState<string>("");
  const [sortBy, setSortBy] = useState<
    "name" | "size" | "createdAt" | "mimeType"
  >("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
  const [renameName, setRenameName] = useState("");

  // ── Fetch files ─────────────────────────────────────────────────────────────
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ["files", folderId ?? "root"],
    queryFn: async () => {
      const res = await api.get("/files", { params: { folderId } });
      return res.data as { files: any[] };
    },
  });

  // ── Fetch subfolders ─────────────────────────────────────────────────────────
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

  // Fetch categories for selector
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
      setSelectedFiles([]);
      useToast.getState().add(`${ids.length} files deleted`);
    },
    onError: () => useToast.getState().add("Failed to delete files", "error"),
  });

  const files = filesData?.files ?? [];
  const folders = foldersData?.folders ?? [];
  const isLoading = filesLoading || foldersLoading;
  const isEmpty = files.length === 0 && folders.length === 0;

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
  const handleSort = (col: "name" | "size" | "createdAt" | "mimeType") => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const handleDelete = async (file: any) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    try {
      await api.delete(`/files/${file.id}`);
      queryClient.invalidateQueries({
        queryKey: ["files", folderId ?? "root"],
      });
    } catch {
      alert("Failed to delete file");
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

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-gray-500 mb-4 flex-wrap">
          <Home size={14} className="shrink-0" />
          <span
            onClick={() => navigate("/browse")}
            className={clsx(
              "cursor-pointer hover:text-gray-800 transition-colors px-1",
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
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-base font-semibold text-gray-900">
            {ancestors.length > 0
              ? ancestors[ancestors.length - 1].name
              : "All Files"}
          </h1>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "grid"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  viewMode === "list"
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
              >
                <List size={15} />
              </button>
            </div>

            {/* New Folder */}
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm
                         text-gray-700 border border-gray-300 rounded-lg
                         hover:bg-gray-50 transition-colors font-medium"
            >
              <FolderPlus size={15} />
              New Folder
            </button>

            {/* Upload */}
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm
                         bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                         transition-colors font-medium"
            >
              <Upload size={15} />
              Upload
            </button>
          </div>
        </div>

        {/* New Folder dialog */}
        {showNewFolder && (
          <form
            onSubmit={handleCreateFolder}
            className="flex items-center gap-2 mb-4 p-3 bg-blue-50
               border border-blue-200 rounded-xl flex-wrap"
          >
            <Folder size={16} className="text-blue-500 shrink-0" />
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name…"
              className="flex-1 min-w-32 bg-white border border-blue-200 rounded-lg
                 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={newFolderCategoryId}
              onChange={(e) => setNewFolderCategoryId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg
                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg
                 hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
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
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
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
        {selectedFiles.length > 0 && (
          <div
            className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-blue-50 border
                  border-blue-200 rounded-xl"
          >
            <span className="text-sm font-medium text-blue-700">
              {selectedFiles.length} selected
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() =>
                  setMoveFiles(
                    files.filter((f) => selectedFiles.includes(f.id)),
                  )
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-700
                   bg-white border border-blue-200 rounded-lg hover:bg-blue-50 font-medium"
              >
                <FolderInput size={14} /> Move
              </button>
              <button
                onClick={() => {
                  if (!confirm(`Delete ${selectedFiles.length} files?`)) return;
                  bulkDelete.mutate(selectedFiles);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600
                   bg-white border border-red-200 rounded-lg hover:bg-red-50 font-medium"
              >
                <Trash2 size={14} /> Delete
              </button>
              <button
                onClick={() => setSelectedFiles([])}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 border-2 border-blue-600 border-t-transparent
                            rounded-full animate-spin"
            />
          </div>
        ) : isEmpty ? (
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div
                className="w-14 h-14 bg-gray-100 rounded-full flex items-center
                              justify-center mb-4"
              >
                <Upload size={22} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {!filesLoading &&
                  !foldersLoading &&
                  (filesData?.files?.length ?? 0) === 0 &&
                  (foldersData?.folders?.length ?? 0) === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <Upload size={28} className="text-blue-400" />
                      </div>
                      <h3 className="text-gray-700 font-medium mb-1">
                        This folder is empty
                      </h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Upload files or create a folder to get started
                      </p>
                      <button
                        onClick={() => setShowUpload(true)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                      >
                        Upload files
                      </button>
                    </div>
                  )}
              </p>
              <p className="text-xs text-gray-400 mt-1 mb-4">
                Create a folder or upload files to get started
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="text-sm text-gray-600 border border-gray-300
                             hover:bg-gray-50 px-3 py-1.5 rounded-lg
                             transition-colors font-medium"
                >
                  New Folder
                </button>
                <button
                  onClick={() => setShowUpload(true)}
                  className="text-sm text-blue-600 hover:text-blue-700
                             font-medium transition-colors px-3 py-1.5"
                >
                  Upload files →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Subfolders */}
            {folders.length > 0 && (
              <div>
                <p
                  className="text-xs font-medium text-gray-400 uppercase
                               tracking-wider mb-3"
                >
                  Folders ({folders.length})
                </p>
                <div
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4
                                lg:grid-cols-5 gap-3"
                >
                  {folders.map((folder) => (
                    <div key={folder.id} className="relative group">
                      <button
                        onClick={() => navigate(`/browse/${folder.id}`)}
                        className="w-full flex flex-col items-center p-4 bg-white
                 border border-gray-200 rounded-xl hover:border-blue-300
                 hover:shadow-sm transition-all text-center"
                      >
                        <div
                          className="w-12 h-12 bg-blue-50 rounded-xl flex items-center
                      justify-center mb-3 group-hover:bg-blue-100 transition-colors"
                        >
                          <Folder size={22} className="text-blue-500" />
                        </div>
                        <span className="text-xs font-medium text-gray-800 truncate w-full text-center">
                          {folder.name}
                        </span>
                        <span className="text-xs text-gray-400 mt-1">
                          {folder._count.files} file
                          {folder._count.files !== 1 ? "s" : ""}
                        </span>
                      </button>

                      {/* Folder action buttons — show on hover */}
                      <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFolderAssignCategory(folder);
                          }}
                          className="p-1.5 bg-white border border-gray-200 rounded-lg
                   text-gray-400 hover:text-purple-600 hover:border-purple-300
                   shadow-sm transition-colors"
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
                              api.delete(`/folders/${folder.id}`).then(() => {
                                queryClient.invalidateQueries({
                                  queryKey: ["folders", folderId ?? "root"],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["folders", "root"],
                                });
                              });
                            }
                          }}
                          className="p-1.5 bg-white border border-gray-200 rounded-lg
                   text-gray-400 hover:text-red-600 hover:border-red-300
                   shadow-sm transition-colors"
                          title="Delete folder"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                {folders.length > 0 && (
                  <p
                    className="text-xs font-medium text-gray-400 uppercase
                                 tracking-wider mb-3"
                  >
                    Files ({files.length})
                  </p>
                )}
                {viewMode === "grid" ? (
                  <FileGrid files={files} onFileClick={handleFileClick} />
                ) : (
                  <FileList
                    files={files}
                    onFileClick={handleFileClick}
                    onDelete={handleDelete}
                    onShare={handleShare}
                    onVersions={handleVersions}
                    onMove={handleMove}
                    onRename={(file) => {
                      setRenameFile(file);
                      setRenameName(file.name);
                    }}
                    selectedIds={selectedFiles}
                    onSelectChange={setSelectedFiles}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                )}
              </div>
            )}
          </div>
        )}
        {renameFile && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
              <h3 className="font-semibold mb-4">Rename file</h3>
              <input
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  renameMutation.mutate({ id: renameFile.id, name: renameName })
                }
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRenameFile(null)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
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
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Permissions Panel */}
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
    </AppShell>
  );
}
