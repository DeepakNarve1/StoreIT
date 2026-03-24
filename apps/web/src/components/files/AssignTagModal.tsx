import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Hash, Plus, Loader, Check } from "lucide-react";
import api from "../../api/axios";
import clsx from "clsx";

interface Tag {
  id: string;
  name: string;
  color: string;
  _count?: { files: number };
}

interface AssignTagModalProps {
  file: {
    id: string;
    name: string;
  };
  onClose: () => void;
}

const PRESET_COLORS = [
  "#3B8BD4",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6B7280",
];

export default function AssignTagModal({ file, onClose }: AssignTagModalProps) {
  const queryClient = useQueryClient();

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [showCreate, setShowCreate] = useState(false);

  // ── Fetch ALL tenant tags ────────────────────────────────────────────────
  const { data: tagsData, isLoading: tagsLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await api.get("/tags");
      return res.data as { tags: Tag[] };
    },
  });
  const allTags = tagsData?.tags ?? [];

  // ── Fetch THIS file's current tags live — so toggling updates instantly ──
  // We query the file list and find this file to get its current tag set.
  // This avoids the stale prop problem where file.tags never updates after
  // assign/remove because tagFile state in the parent doesn't refresh.
  const { data: fileTagsData, isLoading: fileTagsLoading } = useQuery({
    queryKey: ["file-tags", file.id],
    queryFn: async () => {
      const res = await api.get(`/files/${file.id}/tags`);
      return res.data as { tags: { tag: Tag }[] };
    },
  });
  const currentTagIds = new Set(
    (fileTagsData?.tags ?? []).map((t) => t.tag.id),
  );

  // ── Assign tag ────────────────────────────────────────────────────────────
  const assignTag = useMutation({
    mutationFn: async (tagId: string) => {
      await api.post(`/tags/${tagId}/files/${file.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-tags", file.id] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  // ── Remove tag ────────────────────────────────────────────────────────────
  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      await api.delete(`/tags/${tagId}/files/${file.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-tags", file.id] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  // ── Create new tag then assign it ─────────────────────────────────────────
  const createTag = useMutation({
    mutationFn: async () => {
      const res = await api.post("/tags", {
        name: newTagName.trim(),
        color: newTagColor,
      });
      return res.data as { tag: Tag };
    },
    onSuccess: async (data) => {
      await assignTag.mutateAsync(data.tag.id);
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setNewTagName("");
      setNewTagColor(PRESET_COLORS[0]);
      setShowCreate(false);
    },
  });

  const handleToggle = (tag: Tag) => {
    if (currentTagIds.has(tag.id)) {
      removeTag.mutate(tag.id);
    } else {
      assignTag.mutate(tag.id);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    createTag.mutate();
  };

  const isLoading = tagsLoading || fileTagsLoading;
  const isPending = assignTag.isPending || removeTag.isPending;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-gray-800">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 dark:text-white">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white ">
                Assign Tags
              </p>
              <p className="text-xs text-gray-400 truncate max-w-52 mt-0.5 dark:text-gray-300">
                {file.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors dark:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Current tags as removable pills */}
          {currentTagIds.size > 0 && (
            <div className="px-4 pt-3 pb-1 flex flex-wrap gap-1.5 dark:text-white">
              {(fileTagsData?.tags ?? []).map(({ tag }) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white dark:text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button
                    onClick={() => removeTag.mutate(tag.id)}
                    disabled={removeTag.isPending}
                    className="hover:opacity-70 transition-opacity ml-0.5 dark:text-white"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag list */}
          <div className="max-h-60 overflow-y-auto p-3 space-y-1 dark:text-white">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 dark:text-white dark:bg-gray-900">
                <Loader size={16} className="animate-spin text-gray-400" />
              </div>
            ) : allTags.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 dark:text-white dark:bg-gray-900 ">
                No tags yet — create your first one below
              </p>
            ) : (
              allTags.map((tag) => {
                const isAssigned = currentTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleToggle(tag)}
                    disabled={isPending}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left border dark:text-white dark:bg-gray-900",
                      isAssigned
                        ? "bg-primary-50 dark:bg-primary-900/30 border-primary-100 dark:border-primary-800"
                        : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-white",
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 dark:text-white"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 ">
                      {tag.name}
                    </span>
                    {tag._count !== undefined && (
                      <span className="text-xs text-gray-400 dark:text-white">
                        {tag._count.files} file
                        {tag._count.files !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isAssigned && (
                      <Check
                        size={13}
                        className="text-primary-500 dark:text-primary-400 shrink-0 "
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Create new tag form */}
          {showCreate ? (
            <form
              onSubmit={handleCreate}
              className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3"
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                New tag
              </p>
              <input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name…"
                maxLength={50}
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800
                           text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={clsx(
                      "w-6 h-6 rounded-full transition-transform",
                      newTagColor === color
                        ? "scale-125 ring-2 ring-offset-1 ring-gray-400"
                        : "hover:scale-110",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {newTagName.trim() && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-300">
                    Preview:
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white dark:text-white"
                    style={{ backgroundColor: newTagColor }}
                  >
                    <Hash size={9} />
                    {newTagName.trim()}
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setNewTagName("");
                  }}
                  className="flex-1 px-3 py-1.5 text-sm text-gray-600
                             border border-gray-200 dark:border-gray-700 rounded-lg
                             hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors dark:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTagName.trim() || createTag.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg
                             hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium dark:text-white"
                >
                  {createTag.isPending ? "Creating…" : "Create & assign"}
                </button>
              </div>
            </form>
          ) : (
            <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between dark:text-white">
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 text-sm text-primary-500 
                           hover:text-primary-600 dark:hover:text-primary-300 font-medium transition-colors dark:text-white"
              >
                <Plus size={14} /> New tag
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700
                          rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700
                           transition-colors font-medium dark:text-white"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
