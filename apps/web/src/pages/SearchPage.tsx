import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { BrowserFileItem } from "../types/file-browser";
import { getFileKind } from "../utils/fileMime";

/** Search API file hit — includes optional relations for display */
type SearchFileRow = BrowserFileItem & {
  folder?: { name: string } | null;
  category?: { name: string } | null;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (mimeType: string) => {
  switch (getFileKind(mimeType)) {
    case "image":
      return {
        icon: Image,
        color: "text-green-500 dark:text-green-400",
        bg: "bg-green-50 dark:bg-green-900/20",
      };
    case "video":
      return {
        icon: Film,
        color: "text-purple-500 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-900/20",
      };
    case "audio":
      return {
        icon: Music,
        color: "text-pink-500 dark:text-pink-400",
        bg: "bg-pink-50 dark:bg-pink-900/20",
      };
    case "pdf":
      return {
        icon: FileText,
        color: "text-red-500 dark:text-red-400",
        bg: "bg-red-50 dark:bg-red-900/20",
      };
    case "office":
      return {
        icon: FileText,
        color: "text-primary-500 dark:text-primary-400",
        bg: "bg-primary-50 dark:bg-primary-900/20",
      };
    case "archive":
      return {
        icon: Archive,
        color: "text-yellow-500 dark:text-yellow-400",
        bg: "bg-yellow-50 dark:bg-yellow-900/20",
      };
    case "text":
      return {
        icon: FileText,
        color: "text-gray-500 dark:text-gray-400",
        bg: "bg-gray-50 dark:bg-gray-800",
      };
    default:
      return {
        icon: File,
        color: "text-primary-500 dark:text-primary-400",
        bg: "bg-primary-50 dark:bg-primary-900/20",
      };
  }
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
  const [previewFile, setPreviewFile] = useState<SearchFileRow | null>(null);

  const query = searchParams.get("q") || "";
  const queryClient = useQueryClient();

  // Keep URL in sync with input + type (debounced; avoids stale closures in search)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!input.trim()) {
        setSearchParams({});
        return;
      }
      setSearchParams({ q: input.trim(), type: typeFilter });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, typeFilter, setSearchParams]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", query, typeFilter],
    queryFn: async () => {
      if (!query) return { files: [], folders: [], categories: [], total: 0 };
      const res = await api.get("/search", {
        params: {
          q: query,
          type: typeFilter,
        },
      });
      return res.data as {
        files: SearchFileRow[];
        folders: Array<{
          id: string;
          name: string;
          createdAt: string;
          _count: { files: number };
          category?: { name: string };
        }>;
        categories: Array<{
          id: string;
          name: string;
          _count: { files: number; folders: number };
        }>;
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
  const showResults = hasResults && query.length > 0;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Search header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Search
          </h1>

          {/* Search input */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            />
            <input
              autoFocus
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search files, folders, categories..."
              className="w-full pl-11 pr-10 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800
                         rounded-xl text-sm focus:outline-none focus:ring-2
                         focus:ring-primary-500 focus:border-transparent shadow-sm dark:text-white dark:placeholder-gray-600"
            />
            {input && (
              <button
                onClick={() => {
                  setInput("");
                  setTypeFilter("all");
                  setSearchParams({});
                  queryClient.removeQueries({ queryKey: ["search"] });
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2
                           text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Filter size={13} className="text-gray-400 dark:text-gray-500" />
            {(
              [
                "all",
                "file",
                "folder",
                "pdf",
                "image",
                "video",
                "audio",
                "excel",
                "zip",
              ] as const
            ).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  typeFilter === t
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10",
                )}
              >
                {t === "all"
                  ? "All"
                  : t === "file"
                    ? "Files"
                    : t === "folder"
                      ? "Folders"
                      : t === "pdf"
                        ? "PDF"
                        : t === "image"
                          ? "Images"
                          : t === "video"
                            ? "Video"
                            : t === "audio"
                              ? "Audio"
                              : t === "excel"
                                ? "Excel"
                                : "ZIP"}
              </button>
            ))}
            {searched && !isLoading && (
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                {total} result{total !== 1 ? "s" : ""} for "{query}"
              </span>
            )}
          </div>
        </div>

        {/* Loading */}
        {(isLoading || isFetching) && (
          <div className="flex items-center justify-center py-16">
            <Loader
              size={20}
              className="animate-spin text-gray-400 dark:text-gray-500 mr-3"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Searching...
            </span>
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
        {searched && !isLoading && !isFetching && !hasResults && (
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
        {showResults && !isLoading && (
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
                                 border border-gray-200 rounded-xl hover:border-primary-300
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
                      className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-900
                                 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-primary-300
                                 dark:hover:border-primary-800 hover:shadow-sm transition-all text-left"
                    >
                      <div
                        className="w-9 h-9 bg-primary-50 dark:bg-primary-900/40 rounded-lg flex items-center
                                      justify-center shrink-0"
                      >
                        <Folder
                          size={16}
                          className="text-primary-500 dark:text-primary-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {folder.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {folder._count.files} files
                          {folder.category && ` · ${folder.category.name}`}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-600 shrink-0">
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
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
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
                          "hover:bg-gray-50 dark:hover:bg-white/5 transition-colors",
                          i < files.length - 1 &&
                            "border-b border-gray-100 dark:border-gray-800",
                        )}
                      >
                        <div
                          className={`w-9 h-9 ${bg} rounded-lg flex items-center
                                        justify-center shrink-0`}
                        >
                          <Icon size={16} className={color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {formatBytes(file.size)}
                            {file.folder && ` · ${file.folder.name}`}
                            {file.category && ` · ${file.category.name}`}
                            {(file.version ?? 0) > 1 && ` · v${file.version}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {timeAgo(file.createdAt)}
                          </p>
                          <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">
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
