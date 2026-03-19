import {
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  MoreVertical,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface FileListProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}

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
  return { icon: File, color: "text-blue-500" };
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function FileList({
  files,
  onFileClick,
  onDelete,
}: FileListProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  if (files.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <div className="col-span-6 text-xs font-medium text-gray-500">Name</div>
        <div className="col-span-2 text-xs font-medium text-gray-500">Type</div>
        <div className="col-span-2 text-xs font-medium text-gray-500">Size</div>
        <div className="col-span-2 text-xs font-medium text-gray-500">
          Modified
        </div>
      </div>

      {/* Rows */}
      {files.map((file) => {
        const { icon: Icon, color } = getFileIcon(file.mimeType);
        const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

        return (
          <div
            key={file.id}
            className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100
                       last:border-b-0 hover:bg-gray-50 transition-colors group items-center"
          >
            {/* Name */}
            <button
              onClick={() => onFileClick(file)}
              className="col-span-6 flex items-center gap-3 text-left"
            >
              <Icon size={16} className={color} />
              <span
                className="text-sm text-gray-800 truncate hover:text-blue-600
                               transition-colors font-medium"
              >
                {file.name}
              </span>
            </button>

            {/* Type */}
            <div className="col-span-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {ext}
              </span>
            </div>

            {/* Size */}
            <div className="col-span-2 text-sm text-gray-500">
              {formatBytes(file.size)}
            </div>

            {/* Date + Actions */}
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {new Date(file.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>

              {/* Actions menu */}
              <div className="relative">
                <button
                  onClick={() =>
                    setActiveMenu(activeMenu === file.id ? null : file.id)
                  }
                  className={clsx(
                    "p-1 rounded-lg transition-colors",
                    activeMenu === file.id
                      ? "bg-gray-200 text-gray-700"
                      : "opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-500",
                  )}
                >
                  <MoreVertical size={14} />
                </button>

                {activeMenu === file.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActiveMenu(null)}
                    />
                    <div
                      className="absolute right-0 bottom-full mb-1 w-40 bg-white
                                    border border-gray-200 rounded-xl shadow-lg z-20 p-1"
                    >
                      <button
                        onClick={() => {
                          onFileClick(file);
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm
                                   text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        <Eye size={14} /> Preview
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(
                              `/api/files/${file.id}/download`,
                            );
                            if (!res.ok) {
                              alert(
                                "Download not available yet — storage not connected",
                              );
                              return;
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = file.name;
                            link.click();
                            URL.revokeObjectURL(url); // ✅ clean up memory
                          } catch {
                            alert("Download failed");
                          }
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm
             text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        <Download size={14} /> Download
                      </button>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => {
                            onDelete(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
                                     text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
