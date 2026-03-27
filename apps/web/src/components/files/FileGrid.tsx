import {
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  Star,
  GripVertical,
} from "lucide-react";
import clsx from "clsx";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  isStarred?: boolean;
}

interface FileGridProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onStar?: (file: FileItem) => void;
  onReorder?: (fromId: string, toId: string) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return {
      icon: Image,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-900/30",
    };
  if (mimeType.startsWith("video/"))
    return {
      icon: Film,
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-900/30",
    };
  if (mimeType.startsWith("audio/"))
    return {
      icon: Music,
      color: "text-pink-500",
      bg: "bg-pink-50 dark:bg-pink-900/30",
    };
  if (mimeType.includes("pdf"))
    return {
      icon: FileText,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-900/30",
    };
  if (mimeType.includes("zip") || mimeType.includes("rar"))
    return {
      icon: Archive,
      color: "text-yellow-500",
      bg: "bg-yellow-50 dark:bg-yellow-900/30",
    };
  return {
    icon: File,
    color: "text-primary-500",
    bg: "bg-pink-50 dark:bg-pink-900/40",
  };
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function FileGrid({
  files,
  onFileClick,
  onStar,
  onReorder,
}: FileGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {files.map((file) => {
        const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
        return (
          // Outer wrapper is relative so the star button can be positioned absolutely
          <div
            key={file.id}
            className="relative group"
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/storeit-file-order-id");
              onReorder(fromId, file.id);
            }}
          >
            <button
              onClick={() => onFileClick(file)}
              className="w-full flex flex-col items-center p-4 bg-white dark:bg-gray-800
                         border border-gray-200 dark:border-gray-700 rounded-xl
                         hover:border-pink-300 dark:hover:border-pink-500 hover:shadow-sm
                         transition-all text-left"
            >
              <div
                className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-3",
                  bg,
                )}
              >
                <Icon size={22} className={color} />
              </div>
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">
                {file.name}
              </span>
              <span className="text-xs text-gray-400 mt-1">
                {formatBytes(file.size)}
              </span>
              <span className="text-xs text-gray-400">
                {formatDate(file.createdAt)}
              </span>
            </button>

            {/* Star button — top-right corner, always visible if starred, else shows on hover */}
            {onReorder && (
              <span
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/storeit-file-order-id", file.id)
                }
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2 left-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all
                           text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing"
                title="Drag to reorder"
              >
                <GripVertical size={13} />
              </span>
            )}
            {onStar && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(file);
                }}
                className={clsx(
                  "absolute top-2 right-2 p-1 rounded-lg transition-all",
                  "hover:bg-gray-100 dark:hover:bg-gray-700",
                  file.isStarred
                    ? "opacity-100" // always visible if starred
                    : "opacity-0 group-hover:opacity-100", // visible on hover otherwise
                )}
                title={file.isStarred ? "Unstar" : "Star"}
              >
                <Star
                  size={13}
                  className={
                    file.isStarred
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-gray-400 dark:text-gray-500"
                  }
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
