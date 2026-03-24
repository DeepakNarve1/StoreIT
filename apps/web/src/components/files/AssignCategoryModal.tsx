import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Hash, Check, Loader } from "lucide-react";
import api from "../../api/axios";
import clsx from "clsx";
import { useState } from "react";

interface AssignCategoryModalProps {
  resourceId: string;
  resourceType: "file" | "folder";
  resourceName: string;
  currentCategoryId?: string | null;
  onClose: () => void;
}

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
}

export default function AssignCategoryModal({
  resourceId,
  resourceType,
  resourceName,
  currentCategoryId,
  onClose,
}: AssignCategoryModalProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(
    currentCategoryId ?? null,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get("/categories");
      return res.data as { categories: CategoryItem[] };
    },
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (resourceType === "file") {
        await api.patch(`/files/${resourceId}/category`, {
          categoryId: selected,
        });
      } else {
        await api.patch(`/folders/${resourceId}`, { categoryId: selected });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
  });

  const categories = data?.categories ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Assign Category
              </p>
              <p className="text-xs text-gray-400 truncate max-w-48 mt-0.5">
                {resourceName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Category list */}
          <div className="max-h-72 overflow-y-auto p-3">
            {/* No category option */}
            <button
              onClick={() => setSelected(null)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left mb-1 border",
                selected === null
                  ? "bg-gray-50 border-gray-300"
                  : "border-transparent hover:bg-gray-50",
              )}
            >
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <X size={14} className="text-gray-400" />
              </div>
              <span className="text-sm text-gray-600 flex-1">No category</span>
              {selected === null && (
                <Check size={14} className="text-gray-500" />
              )}
            </button>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader size={16} className="animate-spin text-gray-400" />
              </div>
            ) : (
              categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelected(cat.id)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left mb-1 border",
                    selected === cat.id
                      ? "bg-primary-50 border-primary-100"
                      : "border-transparent hover:bg-gray-50",
                  )}
                >
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Hash size={14} className="text-purple-500" />
                  </div>
                  <span className="text-sm font-medium text-gray-800 flex-1">
                    {cat.name}
                  </span>
                  {selected === cat.id && (
                    <Check size={14} className="text-primary-500" />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-600
                         text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => assign.mutate()}
              disabled={assign.isPending}
              className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700
                         disabled:opacity-50 text-white text-sm font-medium
                         rounded-lg transition-colors"
            >
              {assign.isPending ? "Saving..." : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
