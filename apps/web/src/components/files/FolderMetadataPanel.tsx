import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  X,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/Toast";

type FieldType =
  | "text"
  | "longText"
  | "email"
  | "list"
  | "boolean"
  | "date"
  | "datetime"
  | "number"
  | "integer"
  | "decimal";

type FolderField = {
  key: string;
  type: FieldType;
  required: boolean;
  recursive: boolean;
};

type Props = {
  folderId: string;
  folderName: string;
  onClose: () => void;
};

const TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "String" },
  { value: "longText", label: "Long text" },
  { value: "email", label: "E-mail" },
  { value: "list", label: "List" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Datetime" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
];

export default function FolderMetadataPanel({
  folderId,
  folderName,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const { add } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["folder-metadata-fields", folderId],
    queryFn: async () => {
      const res = await api.get(`/folders/${folderId}/metadata-fields`);
      return res.data as { fields: FolderField[] };
    },
    staleTime: 5_000,
  });

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await api.get("/templates");
      return res.data as {
        templates: {
          id: string;
          name: string;
          fields: { key: string; type: FieldType; required: boolean }[];
        }[];
      };
    },
    staleTime: 60_000,
  });

  const templateFieldsByKey = useMemo(() => {
    const map = new Map<string, { type: FieldType; required: boolean }>();
    for (const t of templatesData?.templates ?? []) {
      for (const f of t.fields ?? []) {
        const k = f.key.trim().toLowerCase();
        if (!k) continue;
        if (!map.has(k)) map.set(k, { type: f.type, required: !!f.required });
      }
    }
    return map;
  }, [templatesData]);

  const [fields, setFields] = useState<FolderField[]>([]);

  useEffect(() => {
    if (data?.fields) setFields(data.fields ?? []);
  }, [data]);

  const [showExistingPicker, setShowExistingPicker] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const addExistingField = (key: string) => {
    const kLower = key.trim().toLowerCase();
    if (!kLower) return;
    if (fields.some((f) => f.key.trim().toLowerCase() === kLower)) return;
    const fromTemplate = templateFieldsByKey.get(kLower);
    if (!fromTemplate) return;
    setFields([
      ...fields,
      {
        key,
        type: fromTemplate.type,
        required: false,
        recursive: false,
      },
    ]);
  };

  const addNewField = (key: string, type: FieldType) => {
    const kLower = key.trim().toLowerCase();
    if (!kLower) return;
    if (fields.some((f) => f.key.trim().toLowerCase() === kLower)) return;
    setFields([
      ...fields,
      { key, type, required: false, recursive: false },
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/folders/${folderId}/metadata-fields`, {
        fields: fields.map((f) => ({
          key: f.key,
          type: f.type,
          required: f.required,
          recursive: f.recursive,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["folder-metadata-fields", folderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["files"],
      });
      queryClient.invalidateQueries({
        queryKey: ["file-metadata-schema"],
      });
      add("Default metadata saved", "success");
      onClose();
    },
    onError: () => add("Failed to save metadata", "error"),
  });

  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FieldType>("text");

  const existingFieldsList = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ key: string; type: FieldType }> = [];
    for (const t of templatesData?.templates ?? []) {
      for (const f of t.fields ?? []) {
        const k = f.key.trim();
        const kLower = k.toLowerCase();
        if (!k || seen.has(kLower)) continue;
        seen.add(kLower);
        list.push({ key: k, type: f.type });
      }
    }
    list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  }, [templatesData]);

  return (
    <div
      className="flex flex-col border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-80 shrink-0 rounded-r-xl overflow-hidden"
      style={{ borderLeft: "none" }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="w-7 h-7 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
          <CheckCircle2 size={14} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            Default metadata fields
          </p>
          <p className="text-xs text-gray-400 truncate" title={folderName}>
            {`in folder "${folderName}"`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          Required (optional), Recursive (subfolders)
        </div>
        <div />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-purple-200 dark:border-purple-700 rounded-full border-t-purple-600 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            <div className="col-span-6 flex items-center gap-2">
              <span>Name</span>
              <button
                onClick={() => setShowExistingPicker(true)}
                className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-purple-600 dark:text-purple-400"
                title="Add from existing metadata fields"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-purple-600 dark:text-purple-400"
                title="Create a new metadata field"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="col-span-3">Required</div>
            <div className="col-span-3">Recursive</div>
          </div>

          <div className="space-y-2">
            {fields.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">
                No default metadata fields yet. Use the + buttons above.
              </div>
            ) : (
              fields.map((f, idx) => {
                return (
                  <div
                    key={`${f.key}-${idx}`}
                    className="grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-6">
                      <input
                        value={f.key}
                        readOnly
                        disabled
                        className="w-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg px-2 py-1.5 text-xs cursor-not-allowed"
                      />
                      <div className="text-[10px] text-gray-400 mt-1">
                        {f.type}
                      </div>
                    </div>

                    <div className="col-span-3 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => {
                          const next = [...fields];
                          next[idx] = {
                            ...next[idx],
                            required: e.target.checked,
                          };
                          setFields(next);
                        }}
                        className="w-3.5 h-3.5"
                      />
                    </div>

                    <div className="col-span-3 flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={f.recursive}
                        onChange={(e) => {
                          const next = [...fields];
                          next[idx] = {
                            ...next[idx],
                            recursive: e.target.checked,
                          };
                          setFields(next);
                        }}
                        className="w-3.5 h-3.5"
                      />
                    </div>

                    {/* Remove button */}
                    <div className="col-span-12 flex justify-end mt-1">
                      <button
                        onClick={() => {
                          const next = fields.filter((_, i) => i !== idx);
                          setFields(next);
                        }}
                        className="inline-flex items-center gap-2 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 justify-end px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-800/20">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
        >
          Save
        </button>
      </div>

      {/* Existing metadata fields picker */}
      {showExistingPicker && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Add existing metadata field
              </p>
              <button
                onClick={() => setShowExistingPicker(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {existingFieldsList.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  No templates found.
                </div>
              ) : (
                <div className="space-y-2">
                  {existingFieldsList.map((f) => {
                    const alreadyAdded = fields.some(
                      (x) => x.key.trim().toLowerCase() === f.key.toLowerCase(),
                    );
                    return (
                      <button
                        key={f.key}
                        disabled={alreadyAdded}
                        onClick={() => {
                          addExistingField(f.key);
                          setShowExistingPicker(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors ${
                          alreadyAdded
                            ? "opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            : "hover:bg-purple-50 dark:hover:bg-purple-900/20 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                        }`}
                      >
                        <span className="text-xs text-left">
                          <span className="font-medium text-gray-800 dark:text-gray-100">
                            {f.key}
                          </span>
                          <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                            {f.type}
                          </span>
                        </span>
                        <ChevronDown size={14} className="text-gray-300" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create new metadata field modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                New metadata field
              </p>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Field name
                </div>
                <input
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Field name"
                  className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Type
                </div>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                  className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    addNewField(newFieldName, newFieldType);
                    setNewFieldName("");
                    setNewFieldType("text");
                    setShowCreateModal(false);
                  }}
                  disabled={!newFieldName.trim()}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

