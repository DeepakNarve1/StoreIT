import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Save,
  X,
  Tag,
  Loader2,
} from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/Toast";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

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

interface MetaField {
  key: string;
  value: string;
  type?: FieldType;
  required?: boolean;
  isDefault?: boolean;
}

export default function FileMetadataPanel({
  fileId,
  fileName,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const { add } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["file-metadata", fileId],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/metadata`);
      return res.data as {
        metadata: { id: string; key: string; value: string }[];
      };
    },
  });

  const { data: schemaData, isLoading: schemaLoading } = useQuery({
    queryKey: ["file-metadata-schema", fileId],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/metadata-schema`);
      return res.data as {
        folderId: string | null;
        fields: { key: string; type: string; required: boolean }[];
      };
    },
    staleTime: 10_000,
  });

  const [fields, setFields] = useState<MetaField[]>([]);

  useEffect(() => {
    if (!data || !schemaData) return;

    const valueByKey = new Map(
      (data.metadata ?? []).map((m) => [m.key.toLowerCase(), m.value]),
    );

    const schemaFields = schemaData.fields ?? [];
    const schemaKeySet = new Set(schemaFields.map((f) => f.key.toLowerCase()));

    const defaultFields: MetaField[] = schemaFields.map((f) => ({
      key: f.key,
      value: valueByKey.get(f.key.toLowerCase()) ?? "",
      type: f.type as FieldType,
      required: !!f.required,
      isDefault: true,
    }));

    const customFields: MetaField[] = (data.metadata ?? [])
      .filter((m) => !schemaKeySet.has(m.key.toLowerCase()))
      .map((m) => ({
        key: m.key,
        value: m.value,
        type: undefined,
        required: false,
        isDefault: false,
      }));

    if (defaultFields.length === 0 && customFields.length === 0) {
      setFields([{ key: "", value: "", type: undefined, required: false, isDefault: false }]);
      return;
    }

    setFields([...defaultFields, ...customFields]);
  }, [data, schemaData]);

  const save = useMutation({
    mutationFn: async () => {
      const validFields = fields.filter((f) => f.key.trim());
      const missingRequired = validFields.filter(
        (f) => f.required && !f.value.trim(),
      );

      if (missingRequired.length > 0) {
        add(
          `Please fill required metadata: ${missingRequired
            .map((f) => f.key)
            .join(", ")}`,
          "error",
        );
        return;
      }
      const payloadFields = validFields.map((f) => ({
        key: f.key,
        value: f.value,
      }));
      await api.put(`/files/${fileId}/metadata`, { fields: payloadFields });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-metadata", fileId] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      add("Metadata saved", "success");
      onClose();
    },
    onError: () => add("Failed to save metadata", "error"),
  });

  const addRow = () =>
    setFields([
      ...fields,
      { key: "", value: "", type: undefined, required: false, isDefault: false },
    ]);
  const removeRow = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) => {
    const next = [...fields];
    next[i] = { ...next[i], [field]: val };
    setFields(next);
  };

  type FolderFieldDef = {
    key: string;
    type: string;
    required: boolean;
    recursive: boolean;
  };

  const [showFolderFieldsEditor, setShowFolderFieldsEditor] = useState(false);
  const folderIdForSchema = schemaData?.folderId ?? null;

  const { data: folderFieldsData, isLoading: folderFieldsLoading } = useQuery({
    queryKey: ["folder-metadata-fields", folderIdForSchema],
    enabled: showFolderFieldsEditor && !!folderIdForSchema,
    queryFn: async () => {
      const res = await api.get(`/folders/${folderIdForSchema}/metadata-fields`);
      return res.data as { fields: FolderFieldDef[] };
    },
  });

  const [folderFields, setFolderFields] = useState<FolderFieldDef[]>([]);

  useEffect(() => {
    if (!folderFieldsData) return;
    setFolderFields(folderFieldsData.fields ?? []);
  }, [folderFieldsData]);

  const addFolderField = () =>
    setFolderFields([
      ...folderFields,
      { key: "", type: "text", required: false, recursive: false },
    ]);

  const updateFolderField = (
    i: number,
    patch: Partial<FolderFieldDef>,
  ) => {
    const next = [...folderFields];
    next[i] = { ...next[i], ...patch };
    setFolderFields(next);
  };

  const removeFolderField = (i: number) =>
    setFolderFields(folderFields.filter((_, idx) => idx !== i));

  const saveFolderFields = useMutation({
    mutationFn: async () => {
      if (!folderIdForSchema) return;
      await api.put(`/folders/${folderIdForSchema}/metadata-fields`, {
        fields: folderFields,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["folder-metadata-fields", folderIdForSchema],
      });
      queryClient.invalidateQueries({
        queryKey: ["file-metadata-schema", fileId],
      });
      add("Metadata fields saved", "success");
      setShowFolderFieldsEditor(false);
    },
    onError: () => add("Failed to save metadata fields", "error"),
  });

  return (
    <div
      className="flex flex-col border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-72 shrink-0 rounded-r-xl overflow-hidden"
      style={{ borderLeft: "none" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="w-7 h-7 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
          <Tag size={14} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            Metadata
          </p>
          <p className="text-xs text-gray-400 truncate" title={fileName}>
            {fileName}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Folder schema editor (FolderIT-style) */}
      {!schemaLoading && !!folderIdForSchema && (
        <div className="px-4 pt-3 pb-1 shrink-0">
          <button
            onClick={() => setShowFolderFieldsEditor(true)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
          >
            Manage all metadata fields
          </button>
        </div>
      )}

      {showFolderFieldsEditor && folderIdForSchema && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowFolderFieldsEditor(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-[360px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Default metadata fields
              </p>
              <button
                onClick={() => setShowFolderFieldsEditor(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {folderFieldsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="text-purple-500 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <span className="col-span-2">Key</span>
                  <span>Type</span>
                  <span>Req</span>
                  <span>Rec</span>
                </div>

                {folderFields.map((f, i) => (
                  <div key={`${f.key}-${i}`} className="grid grid-cols-5 gap-2 items-center">
                    <input
                      value={f.key}
                      onChange={(e) => updateFolderField(i, { key: e.target.value })}
                      placeholder="key"
                      className="col-span-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => updateFolderField(i, { type: e.target.value })}
                      className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="text">String</option>
                      <option value="longText">Long text</option>
                      <option value="boolean">Boolean</option>
                      <option value="date">Date</option>
                      <option value="datetime">Datetime</option>
                      <option value="number">Number</option>
                      <option value="integer">Integer</option>
                      <option value="decimal">Decimal</option>
                      <option value="email">E-mail</option>
                      <option value="list">List</option>
                    </select>
                    <label className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          updateFolderField(i, { required: e.target.checked })
                        }
                        className="w-3.5 h-3.5"
                      />
                    </label>
                    <label className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={f.recursive}
                        onChange={(e) =>
                          updateFolderField(i, { recursive: e.target.checked })
                        }
                        className="w-3.5 h-3.5"
                      />
                    </label>
                    <div className="col-span-5 flex justify-end">
                      <button
                        onClick={() => removeFolderField(i)}
                        className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addFolderField}
                  className="flex items-center gap-2 text-xs text-purple-500 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 pt-2"
                >
                  <Plus size={13} /> New metadata field
                </button>

                <div className="pt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setShowFolderFieldsEditor(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveFolderFields.mutate()}
                    disabled={saveFolderFields.isPending}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
                  >
                    {saveFolderFields.isPending ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>Save</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="text-purple-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="grid grid-cols-2 gap-1.5 mb-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Key
              </p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                Value
              </p>
            </div>

            {fields.map((field, i) => (
              <div key={i} className="flex items-center gap-1.5 group">
                <input
                  value={field.key}
                  onChange={(e) => updateRow(i, "key", e.target.value)}
                  placeholder="key"
                  disabled={!!field.isDefault}
                  readOnly={!!field.isDefault}
                  className={`flex-1 min-w-0 border border-gray-200 dark:border-gray-700 ${
                    field.isDefault
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      : "bg-gray-50 dark:bg-gray-800 dark:text-gray-100"
                  } rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors`}
                />
                {!!field.required && field.isDefault && (
                  <span className="text-red-500 text-xs font-semibold">*</span>
                )}

                {field.type === "date" ? (
                  <input
                    type="date"
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                  />
                ) : field.type === "datetime" ? (
                  <input
                    type="datetime-local"
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                  />
                ) : field.type === "number" ||
                    field.type === "integer" ||
                    field.type === "decimal" ? (
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    placeholder="0"
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                  />
                ) : field.type === "longText" ? (
                  <textarea
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    placeholder="value"
                    rows={2}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors resize-none"
                  />
                ) : (
                  field.type === "boolean" ? (
                    <label className="flex items-center gap-2 px-2">
                      <input
                        type="checkbox"
                        checked={field.value === "true"}
                        onChange={(e) =>
                          updateRow(i, "value", e.target.checked ? "true" : "false")
                        }
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {field.value === "true" ? "True" : "False"}
                      </span>
                    </label>
                  ) : (
                    <input
                      value={field.value}
                      onChange={(e) =>
                        updateRow(i, "value", e.target.value)
                      }
                      placeholder="value"
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                    />
                  )
                )}
                {!field.isDefault && (
                  <button
                    onClick={() => removeRow(i)}
                    className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-2 font-medium py-1 transition-colors"
            >
              <Plus size={12} /> Add field
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 justify-end px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-800/20">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
        >
          {save.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
