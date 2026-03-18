import { FileText, Image, Film, Music, Archive, File } from "lucide-react";
import clsx from "clsx";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface FileGridProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-green-500", bg: "bg-green-50" };
  if (mimeType.startsWith("video/"))
    return { icon: Film, color: "text-purple-500", bg: "bg-purple-50" };
  if (mimeType.startsWith("audio/"))
    return { icon: Music, color: "text-pink-500", bg: "bg-pink-50" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
  if (mimeType.includes("zip") || mimeType.includes("rar"))
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

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function FileGrid({ files, onFileClick }: FileGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {files.map((file) => {
        const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
        return (
          <button
            key={file.id}
            onClick={() => onFileClick(file)}
            className="flex flex-col items-center p-4 bg-white border border-gray-200
                       rounded-xl hover:border-blue-300 hover:shadow-sm transition-all
                       text-left group"
          >
            <div
              className={clsx(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-3",
                bg,
              )}
            >
              <Icon size={22} className={color} />
            </div>
            <span className="text-xs font-medium text-gray-800 truncate w-full text-center">
              {file.name}
            </span>
            <span className="text-xs text-gray-400 mt-1">
              {formatBytes(file.size)}
            </span>
            <span className="text-xs text-gray-400">
              {formatDate(file.createdAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
