import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Tag } from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/Toast";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

export default function FileMetadataPanel({
  fileId,
  fileName,
  onClose,
}: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["file-metadata", fileId],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/metadata`);
      return res.data as {
        metadata: { id: string; key: string; value: string }[];
      };
    },
  });

  const [fields, setFields] = useState<{ key: string; value: string }[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (data && !initialized) {
    setFields(
      data.metadata.length > 0 ? data.metadata : [{ key: "", value: "" }],
    );
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const validFields = fields.filter((f) => f.key.trim());
      await api.put(`/files/${fileId}/metadata`, { fields: validFields });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-metadata", fileId] });
      useToast.getState().add("Metadata saved");
      onClose();
    },
    onError: () => useToast.getState().add("Failed to save metadata", "error"),
  });

  const addRow = () => setFields([...fields, { key: "", value: "" }]);
  const removeRow = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) => {
    const next = [...fields];
    next[i] = { ...next[i], [field]: val };
    setFields(next);
  };

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center gap-3 p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="w-8 h-8 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
            <Tag size={15} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              File metadata
            </p>
            <p className="text-xs text-gray-400 truncate">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 mb-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
                  Key
                </p>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
                  Value
                </p>
              </div>
              {fields.map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={field.key}
                    onChange={(e) => updateRow(i, "key", e.target.value)}
                    placeholder="e.g. vendor"
                    className="flex-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5
                               text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                  />
                  <input
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="flex-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5
                               text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 mt-1 font-medium"
              >
                <Plus size={13} /> Add field
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end p-5 pt-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600
                       text-white rounded-lg hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 font-medium"
          >
            <Save size={13} />
            {save.isPending ? "Saving…" : "Save metadata"}
          </button>
        </div>
      </div>
    </div>
  );
}
