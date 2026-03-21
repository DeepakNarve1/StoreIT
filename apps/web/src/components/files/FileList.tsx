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
  Shield,
  History,
  FolderInput,
  Star,
  Tag,
  Pencil,
  ChevronUp,
  ChevronDown,
  Info,
} from "lucide-react";
import { useState } from "react";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  version?: number;
  isStarred?: boolean;
}

interface FileListProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  onVersions?: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
  onStar?: (file: FileItem) => void;
  onAssignTag?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  selectedIds?: string[];
  onSelectChange?: (ids: string[]) => void;
  sortBy?: "name" | "size" | "createdAt" | "mimeType";
  sortDir?: "asc" | "desc";
  onSort?: (col: "name" | "size" | "createdAt" | "mimeType") => void;
  onDragStart?: (file: FileItem) => void;
  onDragEnd?: () => void;
  onMetadata?: (file: FileItem) => void;
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

function SortIcon({
  col,
  sortBy,
  sortDir,
}: {
  col: string;
  sortBy?: string;
  sortDir?: string;
}) {
  if (sortBy !== col)
    return <ChevronUp size={11} className="text-gray-300 ml-0.5" />;
  return sortDir === "asc" ? (
    <ChevronUp size={11} className="text-blue-500 ml-0.5" />
  ) : (
    <ChevronDown size={11} className="text-blue-500 ml-0.5" />
  );
}

export default function FileList({
  files,
  onFileClick,
  onDelete,
  onShare,
  onVersions,
  onMove,
  onStar,
  onAssignTag,
  onRename,
  selectedIds = [],
  onSelectChange,
  sortBy,
  sortDir,
  onSort,
  onDragStart,
  onDragEnd,
  onMetadata,
}: FileListProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const sorted = [...files].sort((a, b) => {
    const dir = sortDir === "desc" ? -1 : 1;
    switch (sortBy) {
      case "size":
        return (a.size - b.size) * dir;
      case "mimeType":
        return a.mimeType.localeCompare(b.mimeType) * dir;
      case "createdAt":
        return (
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
          dir
        );
      case "name":
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });

  if (files.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
      <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-gray-100 bg-gray-50 items-center">
        {onSelectChange && (
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={files.length > 0 && selectedIds.length === files.length}
              onChange={(e) =>
                onSelectChange(e.target.checked ? sorted.map((f) => f.id) : [])
              }
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
            />
          </div>
        )}
        <div
          className={`${onSelectChange ? "col-span-5" : "col-span-6"} text-xs font-medium text-gray-500`}
        >
          {onSort ? (
            <button
              onClick={() => onSort("name")}
              className="flex items-center hover:text-gray-700"
            >
              Name <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} />
            </button>
          ) : (
            "Name"
          )}
        </div>
        <div className="col-span-2 text-xs font-medium text-gray-500">
          {onSort ? (
            <button
              onClick={() => onSort("mimeType")}
              className="flex items-center hover:text-gray-700"
            >
              Type <SortIcon col="mimeType" sortBy={sortBy} sortDir={sortDir} />
            </button>
          ) : (
            "Type"
          )}
        </div>
        <div className="col-span-2 text-xs font-medium text-gray-500">
          {onSort ? (
            <button
              onClick={() => onSort("size")}
              className="flex items-center hover:text-gray-700"
            >
              Size <SortIcon col="size" sortBy={sortBy} sortDir={sortDir} />
            </button>
          ) : (
            "Size"
          )}
        </div>
        <div className="col-span-2 text-xs font-medium text-gray-500">
          {onSort ? (
            <button
              onClick={() => onSort("createdAt")}
              className="flex items-center hover:text-gray-700"
            >
              Modified{" "}
              <SortIcon col="createdAt" sortBy={sortBy} sortDir={sortDir} />
            </button>
          ) : (
            "Modified"
          )}
        </div>
      </div>

      {/* Rows */}
      {sorted.map((file) => {
        const { icon: Icon, color } = getFileIcon(file.mimeType);
        const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

        return (
          <div
            key={file.id}
            className="relative group grid grid-cols-12 gap-4 px-4 py-3 border-b
             border-gray-100 hover:bg-gray-50 items-center"
            draggable={!!onDragStart}
            onDragStart={() => onDragStart?.(file)}
            onDragEnd={() => onDragEnd?.()}
          >
            {onSelectChange && (
              <div
                className="col-span-1 flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(file.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selectedIds, file.id]
                      : selectedIds.filter((id) => id !== file.id);
                    onSelectChange(next);
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
              </div>
            )}
            {/* Name */}
            <button
              onClick={() => onFileClick(file)}
              className={`${onSelectChange ? "col-span-5" : "col-span-6"} flex items-center gap-3 text-left`}
            >
              <Icon size={16} className={color} />
              <span
                className="text-sm text-gray-800 truncate hover:text-blue-600
                               transition-colors font-medium"
              >
                {file.name}
              </span>
              {(file.version ?? 0) > 1 && (
                <span
                  className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5
                   rounded-full font-medium ml-1 shrink-0"
                >
                  v{file.version}
                </span>
              )}
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
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100
           hover:bg-gray-100 transition-opacity text-gray-400"
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
                      className="absolute right-0 top-full mb-1 w-40 bg-white
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
                      {onStar && (
                        <button
                          onClick={() => {
                            onStar(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
               text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <Star size={14} />{" "}
                          {file.isStarred ? "Unstar" : "Star"}
                        </button>
                      )}
                      {onRename && (
                        <button
                          onClick={() => {
                            onRename(file);
                            setActiveMenu(null);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil size={14} /> Rename
                        </button>
                      )}
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
                      {onShare && (
                        <button
                          onClick={() => {
                            onShare(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
               text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <Shield size={14} /> Permissions
                        </button>
                      )}
                      {onVersions && (
                        <button
                          onClick={() => {
                            onVersions(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
               text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <History size={14} /> Version History
                        </button>
                      )}
                      {onMove && (
                        <button
                          onClick={() => {
                            onMove(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
               text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <FolderInput size={14} /> Move to folder
                        </button>
                      )}
                      {onAssignTag && (
                        <button
                          onClick={() => {
                            onAssignTag(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm
               text-gray-700 hover:bg-gray-100 rounded-lg"
                        >
                          <Tag size={14} /> Assign tag
                        </button>
                      )}
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
                        {onMetadata && (
                          <button
                            onClick={() => {
                              onMetadata(file);
                              setActiveMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                          >
                            <Info size={14} /> Metadata
                          </button>
                        )}
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
