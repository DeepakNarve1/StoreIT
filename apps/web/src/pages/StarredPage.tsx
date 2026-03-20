import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FilePreviewModal from "../components/files/FilePreviewModal";
import api from "../api/axios";
import clsx from "clsx";

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-green-500", bg: "bg-green-50" };
  if (mimeType.startsWith("video/"))
    return { icon: Film, color: "text-purple-500", bg: "bg-purple-50" };
  if (mimeType.startsWith("audio/"))
    return { icon: Music, color: "text-pink-500", bg: "bg-pink-50" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
  if (mimeType.includes("zip"))
    return { icon: Archive, color: "text-yellow-500", bg: "bg-yellow-50" };
  return { icon: File, color: "text-blue-500", bg: "bg-blue-50" };
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function StarredPage() {
  const queryClient = useQueryClient();
  const [previewFile, setPreviewFile] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["starred-files"],
    queryFn: async () => {
      const res = await api.get("/files/starred");
      return res.data as { files: any[] };
    },
  });

  const toggleStar = useMutation({
    mutationFn: async (fileId: string) => {
      await api.patch(`/files/${fileId}/star`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["starred-files"] });
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
    },
  });

  const files = data?.files ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-yellow-50 rounded-xl flex items-center justify-center">
            <Star size={18} className="text-yellow-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Starred</h1>
            <p className="text-xs text-gray-400">
              {files.length} starred file{files.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Star size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">
              No starred files
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Star files to find them quickly here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {files.map((file) => {
              const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
              return (
                <div key={file.id} className="relative group">
                  <button
                    onClick={() => setPreviewFile(file)}
                    className="w-full flex flex-col items-center p-4 bg-white border
                               border-gray-200 rounded-xl hover:border-yellow-300
                               hover:shadow-sm transition-all text-center"
                  >
                    <div
                      className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-3`}
                    >
                      <Icon size={22} className={color} />
                    </div>
                    <span className="text-xs font-medium text-gray-800 truncate w-full text-center">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      {formatBytes(file.size)}
                    </span>
                  </button>

                  {/* Unstar button */}
                  <button
                    onClick={() => toggleStar.mutate(file.id)}
                    className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200
                               rounded-lg text-yellow-500 shadow-sm opacity-0
                               group-hover:opacity-100 transition-all"
                    title="Remove from starred"
                  >
                    <Star size={12} fill="currentColor" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </AppShell>
  );
}
