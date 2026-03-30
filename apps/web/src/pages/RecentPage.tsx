import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
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
import type { BrowserFileItem } from "../types/file-browser";

type RecentFileRow = BrowserFileItem & {
  updatedAt?: string;
  folder?: { name: string } | null;
};
import clsx from "clsx";

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return {
      icon: Image,
      color: "text-green-500 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-900/20",
    };
  if (mimeType.startsWith("video/"))
    return {
      icon: Film,
      color: "text-purple-500 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    };
  if (mimeType.startsWith("audio/"))
    return {
      icon: Music,
      color: "text-pink-500 dark:text-pink-400",
      bg: "bg-pink-50 dark:bg-pink-900/20",
    };
  if (mimeType.includes("pdf"))
    return {
      icon: FileText,
      color: "text-red-500 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-900/20",
    };
  if (mimeType.includes("zip"))
    return {
      icon: Archive,
      color: "text-yellow-500 dark:text-yellow-400",
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
    };
  return {
    icon: File,
    color: "text-primary-500 dark:text-primary-400",
    bg: "bg-primary-50 dark:bg-primary-900/20",
  };
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export default function RecentPage() {
  const queryClient = useQueryClient();
  const [previewFile, setPreviewFile] = useState<RecentFileRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recent-files"],
    queryFn: async () => {
      const res = await api.get("/files/recent");
      return res.data as { files: RecentFileRow[] };
    },
  });

  const toggleStar = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await api.patch(`/files/${fileId}/star`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-files"] });
      queryClient.invalidateQueries({ queryKey: ["starred-files"] });
    },
  });

  const files = data?.files ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-primary-50 dark:bg-primary-500/10 rounded-xl flex items-center justify-center">
            <Clock
              size={18}
              className="text-primary-500 dark:text-primary-400"
            />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Files you recently accessed or uploaded
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock
              size={32}
              className="text-gray-300 dark:text-gray-600 mb-3"
            />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              No recent files
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Files you upload or view will appear here
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5">
              <div className="col-span-12 lg:col-span-5 text-xs font-medium text-gray-500 dark:text-gray-400">
                Name
              </div>
              <div className="hidden lg:block col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Location
              </div>
              <div className="hidden lg:block col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Size
              </div>
              <div className="hidden lg:block col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                Modified
              </div>
              <div className="hidden lg:block col-span-1" />
            </div>

            {files.map((file, i) => {
              const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
              return (
                <div
                  key={file.id}
                  className={clsx(
                    "grid grid-cols-12 gap-4 px-4 py-3 items-center",
                    "hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group",
                    i < files.length - 1 &&
                      "border-b border-gray-100 dark:border-gray-800",
                  )}
                >
                  {/* Name */}
                  <button
                    onClick={() => setPreviewFile(file)}
                    className="col-span-10 lg:col-span-5 flex items-center gap-3 text-left"
                  >
                    <div
                      className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center shrink-0`}
                    >
                      <Icon size={15} className={color} />
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate hover:text-primary-600 dark:hover:text-primary-400">
                      {file.name}
                    </span>
                  </button>

                  {/* Location */}
                  <div className="hidden lg:block col-span-2 text-xs text-gray-400 dark:text-gray-500 truncate">
                    {file.folder?.name ?? "Root"}
                  </div>

                  {/* Size */}
                  <div className="hidden lg:block col-span-2 text-sm text-gray-500 dark:text-gray-400">
                    {formatBytes(file.size)}
                  </div>

                  {/* Time */}
                  <div className="col-span-1 lg:col-span-2 text-sm text-gray-500 dark:text-gray-400">
                    {timeAgo(file.updatedAt ?? file.createdAt)}
                  </div>

                  {/* Star */}
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => toggleStar.mutate(file.id)}
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        file.isStarred
                          ? "text-yellow-500"
                          : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-yellow-400",
                      )}
                    >
                      <Star
                        size={15}
                        fill={file.isStarred ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
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
