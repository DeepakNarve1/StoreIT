import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Tag,
  Plus,
  Trash2,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  X,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import FilePreviewModal from "../components/files/FilePreviewModal";
import api from "../api/axios";
import { useAuthStore } from "../store/authStore";
import type { BrowserFileItem } from "../types/file-browser";

type TagListItem = {
  id: string;
  name: string;
  color: string;
  _count?: { files: number };
};

type TagFileRow = BrowserFileItem & {
  folder?: { name: string } | null;
};

const TAG_COLORS = [
  "#3B8BD4",
  "#3B6D11",
  "#633806",
  "#A32D2D",
  "#3C3489",
  "#0F6E56",
  "#72243E",
  "#5F5E5A",
];

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

export default function TagsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canMutate = ["ORG_ADMIN", "SUPERADMIN", "MANAGER", "EDITOR"].includes(
    user?.role ?? "",
  );
  const [selectedTag, setSelectedTag] = useState<TagListItem | null>(null);
  const [previewFile, setPreviewFile] = useState<TagFileRow | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);

  const { data: tagsData, isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await api.get("/tags");
      return res.data as { tags: TagListItem[] };
    },
  });

  const { data: tagFilesData } = useQuery({
    queryKey: ["tag-files", selectedTag?.id],
    queryFn: async () => {
      const tagId = selectedTag!.id;
      const res = await api.get(`/tags/${tagId}/files`);
      return res.data as { files: TagFileRow[] };
    },
    enabled: !!selectedTag?.id,
  });

  const createTag = useMutation({
    mutationFn: async () => {
      const res = await api.post("/tags", {
        name: newTagName,
        color: newTagColor,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setNewTagName("");
      setShowCreate(false);
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (tagId: string) => {
      await api.delete(`/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      if (selectedTag) setSelectedTag(null);
    },
  });

  const tags = tagsData?.tags ?? [];
  const tagFiles = tagFilesData?.files ?? [];

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 dark:bg-purple-500/10 rounded-xl flex items-center justify-center">
              <Tag size={18} className="text-purple-500 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white  ">
                Tags
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {tags.length} tag{tags.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {canMutate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700
                         text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} />
              New Tag
            </button>
          )}
        </div>

        {/* Create tag form */}
        {canMutate && showCreate && (
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Create Tag
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name..."
                className="flex-1 min-w-32 px-3 py-2 bg-white dark:bg-gray-900 border border-primary-100 dark:border-primary-800
                           rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-white dark:placeholder-gray-500"
              />
              <div className="flex items-center gap-2">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className="w-6 h-6 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: color,
                      borderColor:
                        newTagColor === color ? "#1d4ed8" : "transparent",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={() => createTag.mutate()}
                disabled={!newTagName.trim() || createTag.isPending}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium
                           rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {createTag.isPending ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {/* Tag list */}
          <div className="w-56 shrink-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-12">
                <Tag
                  size={24}
                  className="text-gray-300 dark:text-gray-600 mx-auto mb-2"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No tags yet
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl
                               cursor-pointer transition-colors group
                               ${
                                 selectedTag?.id === tag.id
                                   ? "bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800"
                                   : "hover:bg-gray-100 dark:hover:bg-white/5 border border-transparent"
                               }`}
                    onClick={() => setSelectedTag(tag)}
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">
                      {tag.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {tag._count?.files ?? 0}
                    </span>
                    {canMutate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete tag "${tag.name}"?`)) {
                            deleteTag.mutate(tag.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500
                                   hover:text-red-500 dark:hover:text-red-400 transition-all p-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tag files */}
          <div className="flex-1 min-w-0">
            {!selectedTag ? (
              <div
                className="flex flex-col items-center justify-center py-20 text-center
                              bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl"
              >
                <Tag
                  size={24}
                  className="text-gray-300 dark:text-gray-600 mb-2"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select a tag to see its files
                </p>
              </div>
            ) : tagFiles.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-20 text-center
                              bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl"
              >
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  No files tagged with "{selectedTag.name}"
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Assign this tag to files from the file menu
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedTag.color }}
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedTag.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                    {tagFiles.length} file{tagFiles.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {tagFiles.map((file, i) => {
                  const { icon: Icon, color } = getFileIcon(file.mimeType);
                  return (
                    <button
                      key={file.id}
                      onClick={() => setPreviewFile(file)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left
                                  hover:bg-gray-50 dark:hover:bg-white/5 transition-colors
                                  ${i < tagFiles.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""}`}
                    >
                      <Icon size={16} className={color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {file.folder?.name ?? "Root"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
