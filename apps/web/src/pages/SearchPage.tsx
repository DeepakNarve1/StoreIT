import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  FileText,
  Folder,
  Hash,
  Image,
  Film,
  Music,
  Archive,
  File,
  Loader,
  X,
  Filter,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FilePreviewModal from "../components/files/FilePreviewModal";
import api from "../api/axios";
import clsx from "clsx";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

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

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(searchParams.get("q") || "");
  const [typeFilter, setTypeFilter] = useState(
    searchParams.get("type") || "all",
  );
  const [previewFile, setPreviewFile] = useState<any>(null);

  const query = searchParams.get("q") || "";

  // Update URL when input changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim()) {
        setSearchParams({ q: input.trim(), type: typeFilter });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, typeFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["search", query, typeFilter],
    queryFn: async () => {
      if (!query) return { files: [], folders: [], categories: [], total: 0 };
      const res = await api.get("/search", {
        params: { q: query, type: typeFilter },
      });
      return res.data as {
        files: any[];
        folders: any[];
        categories: any[];
        total: number;
        query: string;
      };
    },
    enabled: query.length > 0,
  });

  const files = data?.files ?? [];
  const folders = data?.folders ?? [];
  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;
  const hasResults = total > 0;
  const searched = query.length > 0;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Search header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 mb-4">Search</h1>

          {/* Search input */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              autoFocus
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search files, folders, categories..."
              className="w-full pl-11 pr-10 py-3 bg-white border border-gray-200
                         rounded-xl text-sm focus:outline-none focus:ring-2
                         focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
            {input && (
              <button
                onClick={() => {
                  setInput("");
                  setSearchParams({});
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2
                           text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-2 mt-3">
            <Filter size={13} className="text-gray-400" />
            {(["all", "file", "folder"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  typeFilter === t
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                )}
              >
                {t === "all" ? "All" : t === "file" ? "Files" : "Folders"}
              </button>
            ))}
            {searched && !isLoading && (
              <span className="ml-auto text-xs text-gray-400">
                {total} result{total !== 1 ? "s" : ""} for "{query}"
              </span>
            )}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader size={20} className="animate-spin text-gray-400 mr-3" />
            <span className="text-sm text-gray-500">Searching...</span>
          </div>
        )}

        {/* Empty state — no query */}
        {!searched && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 bg-gray-100 rounded-full flex items-center
                            justify-center mb-4"
            >
              <Search size={28} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">
              Start typing to search
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Search across files, folders and categories
            </p>
          </div>
        )}

        {/* No results */}
        {searched && !isLoading && !hasResults && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 bg-gray-100 rounded-full flex items-center
                            justify-center mb-4"
            >
              <Search size={28} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">
              No results for "{query}"
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Try a different search term or filter
            </p>
          </div>
        )}

        {/* Results */}
        {hasResults && !isLoading && (
          <div className="space-y-6">
            {/* Categories */}
            {categories.length > 0 && (
              <div>
                <p
                  className="text-xs font-medium text-gray-400 uppercase
                               tracking-wider mb-3"
                >
                  Categories ({categories.length})
                </p>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => navigate(`/category/${cat.id}`)}
                      className="w-full flex items-center gap-3 p-3 bg-white
                                 border border-gray-200 rounded-xl hover:border-blue-300
                                 hover:shadow-sm transition-all text-left"
                    >
                      <div
                        className="w-9 h-9 bg-purple-50 rounded-lg flex items-center
                                      justify-center shrink-0"
                      >
                        <Hash size={16} className="text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {cat.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {cat._count.files} files · {cat._count.folders}{" "}
                          folders
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Folders */}
            {folders.length > 0 && (
              <div>
                <p
                  className="text-xs font-medium text-gray-400 uppercase
                               tracking-wider mb-3"
                >
                  Folders ({folders.length})
                </p>
                <div className="space-y-2">
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => navigate(`/browse/${folder.id}`)}
                      className="w-full flex items-center gap-3 p-3 bg-white
                                 border border-gray-200 rounded-xl hover:border-blue-300
                                 hover:shadow-sm transition-all text-left"
                    >
                      <div
                        className="w-9 h-9 bg-blue-50 rounded-lg flex items-center
                                      justify-center shrink-0"
                      >
                        <Folder size={16} className="text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {folder.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {folder._count.files} files
                          {folder.category && ` · ${folder.category.name}`}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {timeAgo(folder.createdAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                <p
                  className="text-xs font-medium text-gray-400 uppercase
                               tracking-wider mb-3"
                >
                  Files ({files.length})
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {files.map((file, i) => {
                    const {
                      icon: Icon,
                      color,
                      bg,
                    } = getFileIcon(file.mimeType);
                    return (
                      <button
                        key={file.id}
                        onClick={() => setPreviewFile(file)}
                        className={clsx(
                          "w-full flex items-center gap-3 px-4 py-3 text-left",
                          "hover:bg-gray-50 transition-colors",
                          i < files.length - 1 && "border-b border-gray-100",
                        )}
                      >
                        <div
                          className={`w-9 h-9 ${bg} rounded-lg flex items-center
                                        justify-center shrink-0`}
                        >
                          <Icon size={16} className={color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatBytes(file.size)}
                            {file.folder && ` · ${file.folder.name}`}
                            {file.category && ` · ${file.category.name}`}
                            {file.version > 1 && ` · v${file.version}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">
                            {timeAgo(file.createdAt)}
                          </p>
                          <p className="text-xs text-gray-300 mt-0.5">
                            {file.mimeType.split("/")[1]?.toUpperCase()}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
