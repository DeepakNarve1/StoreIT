import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  RotateCcw,
  FileText,
  Folder,
  Image,
  Film,
  Music,
  Archive,
  File,
  AlertTriangle,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import api from "../api/axios";
import clsx from "clsx";
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import DeleteModal from "../components/common/DeleteModal";

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-green-500" };
  if (mimeType.startsWith("video/"))
    return { icon: Film, color: "text-purple-500" };
  if (mimeType.startsWith("audio/"))
    return { icon: Music, color: "text-pink-500" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500" };
  if (mimeType.includes("zip"))
    return { icon: Archive, color: "text-yellow-500" };
  return { icon: File, color: "text-primary-500" };
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: "file" | "folder" } | null>(null);
  const canRestore = ["ORG_ADMIN", "SUPERADMIN", "MANAGER", "EDITOR"].includes(
    user?.role ?? "",
  );
  // Only MANAGER+ can hard-delete from trash (Editor can soft-delete files, not permanently erase them)
  const canPermanentDelete = ["ORG_ADMIN", "SUPERADMIN", "MANAGER"].includes(
    user?.role ?? "",
  );
  const { data, isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: async () => {
      const res = await api.get("/files/trash");
      return res.data as { files: any[]; folders: any[] };
    },
  });

  const restoreFile = useMutation({
    mutationFn: async (fileId: string) => {
      await api.patch(`/files/${fileId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });

  const deleteFilePermanent = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/files/${fileId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onSettled: () => setDeleteTarget(null),
  });

  const restoreFolder = useMutation({
    mutationFn: async (folderId: string) => {
      await api.patch(`/folders/${folderId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });

  // ── NEW: permanent delete for folders ─────────────────────────────────────
  const deleteFolderPermanent = useMutation({
    mutationFn: async (folderId: string) => {
      await api.delete(`/folders/${folderId}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onSettled: () => setDeleteTarget(null),
  });

  const files = data?.files ?? [];
  const folders = data?.folders ?? [];
  const isEmpty = files.length === 0 && folders.length === 0;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Trash
              </h1>
              <p className="text-xs text-gray-400">
                {files.length + folders.length} item
                {files.length + folders.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Warning banner */}
        {!isEmpty && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertTriangle size={16} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">
              Items in trash can be restored or permanently deleted. Permanently
              deleted files cannot be recovered.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Trash2 size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Trash is empty</p>
            <p className="text-xs text-gray-400 mt-1">
              Deleted files and folders will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Folders */}
            {folders.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 dark:text-gray-400">
                  Folders ({folders.length})
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                  {folders.map((folder, i) => (
                    <div
                      key={folder.id}
                      className={clsx(
                        "flex items-center gap-3 px-4 py-3 dark:bg-gray-800",
                        i < folders.length - 1 &&
                          "border-b border-gray-100 dark:border-gray-700",
                      )}
                    >
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                        <Folder
                          size={15}
                          className="text-gray-500 dark:text-gray-300"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {folder.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          Deleted {timeAgo(folder.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canRestore && (
                          <button
                            onClick={() => restoreFolder.mutate(folder.id)}
                            disabled={restoreFolder.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs
                                     font-medium text-primary-500 dark:text-primary-400
                                     hover:bg-primary-50 dark:hover:bg-primary-900/30
                                     rounded-lg transition-colors disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            Restore
                          </button>
                        )}
                        {canPermanentDelete && (
                          <button
                            onClick={() => {
                              setDeleteTarget({ id: folder.id, name: folder.name, type: "folder" });
                            }}
                            disabled={deleteFolderPermanent.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs
                                     font-medium text-red-600 dark:text-red-400
                                     hover:bg-red-50 dark:hover:bg-red-900/20
                                     rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            Delete forever
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 dark:text-gray-400">
                  Files ({files.length})
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                  {files.map((file, i) => {
                    const { icon: Icon, color } = getFileIcon(file.mimeType);
                    return (
                      <div
                        key={file.id}
                        className={clsx(
                          "flex items-center gap-3 px-4 py-3 dark:bg-gray-800",
                          i < files.length - 1 &&
                            "border-b border-gray-100 dark:border-gray-700",
                        )}
                      >
                        <Icon size={16} className={color} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            Deleted {timeAgo(file.updatedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {canRestore && (
                            <button
                              onClick={() => restoreFile.mutate(file.id)}
                              disabled={restoreFile.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs
                                       font-medium text-primary-500 dark:text-primary-400
                                       hover:bg-primary-50 dark:hover:bg-primary-900/30
                                       rounded-lg transition-colors disabled:opacity-50"
                            >
                              <RotateCcw size={12} />
                              Restore
                            </button>
                          )}
                          {canPermanentDelete && (
                            <button
                              onClick={() => {
                                setDeleteTarget({ id: file.id, name: file.name, type: "file" });
                              }}
                              disabled={deleteFilePermanent.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs
                                       font-medium text-red-600 dark:text-red-400
                                       hover:bg-red-50 dark:hover:bg-red-900/20
                                       rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Trash2 size={12} />
                              Delete forever
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "file") {
            deleteFilePermanent.mutate(deleteTarget.id);
          } else {
            deleteFolderPermanent.mutate(deleteTarget.id);
          }
        }}
        title="Delete Permanently"
        message={
          deleteTarget?.type === "folder"
            ? `Permanently delete folder "${deleteTarget.name}" and all its contents? This cannot be undone.`
            : `Permanently delete "${deleteTarget?.name}"? This cannot be undone.`
        }
        isLoading={deleteFilePermanent.isPending || deleteFolderPermanent.isPending}
        isPermanent={true}
      />
    </AppShell>
  );
}
