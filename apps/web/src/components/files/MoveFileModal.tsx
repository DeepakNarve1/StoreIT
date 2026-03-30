import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Folder,
  FolderOpen,
  ChevronRight,
  Home,
  Loader,
  Check,
} from "lucide-react";
import api from "../../api/axios";
import clsx from "clsx";

interface MoveFileModalProps {
  files: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: (targetFolderId: string | null, movedFileIds: string[]) => void;
}

interface StoreITem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { files: number; children: number };
}

export default function MoveFileModal({
  files,
  onClose,
  onSuccess,
}: MoveFileModalProps) {
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<
    { id: string | null; name: string }[]
  >([{ id: null, name: "Root" }]);
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | null | "root"
  >("root");

  // Fetch folders at current level
  const { data, isLoading } = useQuery({
    queryKey: ["folders-picker", currentFolderId],
    queryFn: async () => {
      const res = await api.get("/folders", {
        params: { parentId: currentFolderId ?? null },
      });
      return res.data as { folders: StoreITem[] };
    },
  });

  const moveFiles = useMutation({
    mutationFn: async () => {
      const folderId = selectedFolderId === "root" ? null : selectedFolderId;
      await api.post("/files/bulk-move", {
        ids: files.map((file) => file.id),
        folderId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onSuccess(
        selectedFolderId === "root" ? null : selectedFolderId,
        files.map((file) => file.id),
      );
      onClose();
    },
  });

  const navigateInto = (folder: StoreITem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSelectedFolderId(folder.id);
  };

  const navigateTo = (index: number) => {
    const crumb = breadcrumb[index];
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    setCurrentFolderId(crumb.id);
    setSelectedFolderId(crumb.id ?? "root");
  };

  const folders = data?.folders ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-900">Move Files</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Moving {files.length} file{files.length > 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-5 py-2.5 border-b border-gray-100 bg-gray-50">
            {breadcrumb.map((crumb, i) => (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-gray-400" />}
                <button
                  onClick={() => navigateTo(i)}
                  className={clsx(
                    "text-xs font-medium transition-colors flex items-center gap-1",
                    i === breadcrumb.length - 1
                      ? "text-gray-800 pointer-events-none"
                      : "text-primary-500 hover:text-primary-600",
                  )}
                >
                  {i === 0 && <Home size={11} />}
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          {/* Folder list */}
          <div className="max-h-64 overflow-y-auto p-3">
            {/* Root option */}
            {breadcrumb.length === 1 && (
              <button
                onClick={() => setSelectedFolderId("root")}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left mb-1",
                  selectedFolderId === "root"
                    ? "bg-primary-50 border border-primary-100"
                    : "hover:bg-gray-50 border border-transparent",
                )}
              >
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Home size={15} className="text-gray-500" />
                </div>
                <span className="text-sm font-medium text-gray-800">
                  Root (no folder)
                </span>
                {selectedFolderId === "root" && (
                  <Check size={14} className="text-primary-500 ml-auto" />
                )}
              </button>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={16} className="animate-spin text-gray-400" />
              </div>
            ) : folders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-gray-400">No subfolders here</p>
              </div>
            ) : (
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mb-1",
                    selectedFolderId === folder.id
                      ? "bg-primary-50 border border-primary-100"
                      : "hover:bg-gray-50 border border-transparent",
                  )}
                >
                  <button
                    onClick={() => setSelectedFolderId(folder.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                      {selectedFolderId === folder.id ? (
                        <FolderOpen size={15} className="text-primary-500" />
                      ) : (
                        <Folder size={15} className="text-primary-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {folder.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {folder._count.files} files
                      </p>
                    </div>
                    {selectedFolderId === folder.id && (
                      <Check size={14} className="text-primary-500" />
                    )}
                  </button>
                  {folder._count.children > 0 && (
                    <button
                      onClick={() => navigateInto(folder)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Open folder"
                    >
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-600
                         text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => moveFiles.mutate()}
              disabled={moveFiles.isPending}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700
                         disabled:opacity-50 text-white text-sm font-medium
                         rounded-lg transition-colors"
            >
              {moveFiles.isPending ? "Moving..." : `Move Here`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
