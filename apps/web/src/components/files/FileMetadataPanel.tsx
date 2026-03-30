import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, X, Tag, Loader2 } from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/toastStore";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
  variant?: "sidebar" | "page";
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
  options?: string[];
}

export default function FileMetadataPanel({
  fileId,
  fileName,
  onClose,
  variant = "sidebar",
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
        fields: { key: string; type: string; required: boolean; options?: string[] }[];
      };
    },
    staleTime: 10_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["file-metadata-history", fileId],
    queryFn: async () => {
      const res = await api.get(`/files/${fileId}/metadata-history`);
      return res.data as {
        logs: Array<{
          id: string;
          action: string;
          createdAt: string;
          metadata?: {
            fieldCount?: number;
            keys?: string[];
            changes?: Array<{ key?: string; before?: string; after?: string }>;
          } | null;
          user?: { name?: string | null; email?: string | null } | null;
        }>;
      };
    },
    staleTime: 10_000,
  });

  const baselineFields = useMemo((): MetaField[] | null => {
    if (!data || !schemaData) return null;

    const valueByKey = new Map(
      (data.metadata ?? []).map((m) => [m.key.toLowerCase(), m.value]),
    );

    const schemaFields = schemaData.fields ?? [];
    const schemaKeySet = new Set(schemaFields.map((f) => f.key.toLowerCase()));

    const defaultFields: MetaField[] = schemaFields.map((f) => {
      return {
        key: f.key,
        value: valueByKey.get(f.key.toLowerCase()) ?? "",
        type: f.type as FieldType,
        required: !!f.required,
        isDefault: true,
        options: f.type === "list" ? f.options ?? [] : [],
      };
    });

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
      return [
        {
          key: "",
          value: "",
          type: undefined,
          required: false,
          isDefault: false,
        },
      ];
    }

    return [...defaultFields, ...customFields];
  }, [data, schemaData]);

  const [fieldsPatch, setFieldsPatch] = useState<MetaField[] | null>(null);
  const fields = fieldsPatch ?? baselineFields ?? [];

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

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const decimalRegex = /^-?\d+(\.\d+)?$/;
      const invalidFields: string[] = [];

      for (const f of validFields) {
        const raw = f.value?.trim() ?? "";
        if (!raw) continue;
        const type = f.type;

        if (type === "email" && !emailRegex.test(raw)) {
          invalidFields.push(`${f.key} (email)`);
          continue;
        }
        if (type === "number") {
          const n = Number(raw);
          if (!Number.isFinite(n)) invalidFields.push(`${f.key} (number)`);
          continue;
        }
        if (type === "integer") {
          const n = Number(raw);
          if (!Number.isInteger(n)) invalidFields.push(`${f.key} (integer)`);
          continue;
        }
        if (type === "decimal") {
          if (!decimalRegex.test(raw)) invalidFields.push(`${f.key} (decimal)`);
          continue;
        }
        if (type === "date" || type === "datetime") {
          if (Number.isNaN(new Date(raw).getTime())) {
            invalidFields.push(`${f.key} (${type})`);
          }
          continue;
        }
        if (type === "boolean") {
          if (raw !== "true" && raw !== "false") {
            invalidFields.push(`${f.key} (boolean)`);
          }
          continue;
        }
        if (type === "list") {
          const opts = f.options ?? [];
          if (opts.length > 0 && !opts.includes(raw)) {
            invalidFields.push(`${f.key} (list)`);
          }
        }
      }

      if (invalidFields.length > 0) {
        add(`Invalid metadata values: ${invalidFields.join(", ")}`, "error");
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
    setFieldsPatch((prev) => [
      ...(prev ?? baselineFields ?? []),
      {
        key: "",
        value: "",
        type: undefined,
        required: false,
        isDefault: false,
      },
    ]);
  const removeRow = (i: number) =>
    setFieldsPatch((prev) =>
      (prev ?? baselineFields ?? []).filter((_, idx) => idx !== i),
    );
  const updateRow = (i: number, field: "key" | "value", val: string) => {
    setFieldsPatch((prev) => {
      const base = [...(prev ?? baselineFields ?? [])];
      base[i] = { ...base[i], [field]: val };
      return base;
    });
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
      const res = await api.get(
        `/folders/${folderIdForSchema}/metadata-fields`,
      );
      return res.data as { fields: FolderFieldDef[] };
    },
  });

  const baselineFolderFields = useMemo(
    () => folderFieldsData?.fields ?? [],
    [folderFieldsData],
  );
  const [folderFieldsPatch, setFolderFieldsPatch] = useState<
    FolderFieldDef[] | null
  >(null);
  const folderFields = folderFieldsPatch ?? baselineFolderFields;

  const addFolderField = () =>
    setFolderFieldsPatch((prev) => [
      ...(prev ?? baselineFolderFields),
      { key: "", type: "text", required: false, recursive: false },
    ]);

  const updateFolderField = (i: number, patch: Partial<FolderFieldDef>) => {
    setFolderFieldsPatch((prev) => {
      const base = [...(prev ?? baselineFolderFields)];
      base[i] = { ...base[i], ...patch };
      return base;
    });
  };

  const removeFolderField = (i: number) =>
    setFolderFieldsPatch((prev) =>
      (prev ?? baselineFolderFields).filter((_, idx) => idx !== i),
    );

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
      setFolderFieldsPatch(null);
      setShowFolderFieldsEditor(false);
    },
    onError: () => add("Failed to save metadata fields", "error"),
  });

  return (
    <div
      className={
        variant === "page"
          ? "flex flex-col border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-full max-w-5xl mx-auto rounded-xl overflow-hidden min-h-[70vh]"
          : "flex flex-col border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 w-72 shrink-0 rounded-r-xl overflow-hidden"
      }
      style={variant === "page" ? undefined : { borderLeft: "none" }}
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
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {fields.length} field{fields.length !== 1 ? "s" : ""}
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
              {fields.filter((f) => !!f.required).length} required
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
              {fields.filter((f) => !!f.isDefault).length} default
            </span>
          </div>
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
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() => {
              setFolderFieldsPatch(null);
              setShowFolderFieldsEditor(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
          >
            Manage all metadata fields
          </button>
        </div>
      )}

      {showFolderFieldsEditor && folderIdForSchema && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
          onClick={() => {
            setFolderFieldsPatch(null);
            setShowFolderFieldsEditor(false);
          }}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl p-4 max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Default metadata fields
              </p>
              <button
                onClick={() => {
                  setFolderFieldsPatch(null);
                  setShowFolderFieldsEditor(false);
                }}
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
                  <div key={i} className="grid grid-cols-5 gap-2 items-center">
                    <input
                      value={f.key}
                      onChange={(e) =>
                        updateFolderField(i, { key: e.target.value })
                      }
                      placeholder="key"
                      className="col-span-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                    />
                    <select
                      value={f.type}
                      onChange={(e) =>
                        updateFolderField(i, { type: e.target.value })
                      }
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
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-1">
              <p className="col-span-4">Key</p>
              <p className="col-span-7">Value</p>
              <p className="col-span-1 text-right">Action</p>
            </div>

            {fields.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/60 dark:bg-gray-800/30">
                No metadata fields yet. Add one to continue.
              </div>
            ) : (
              fields.map((field, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-start rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 group"
                >
                  <div className="col-span-4 min-w-0">
                    <input
                      value={field.key}
                      onChange={(e) => updateRow(i, "key", e.target.value)}
                      placeholder="key"
                      disabled={!!field.isDefault}
                      readOnly={!!field.isDefault}
                      className={`w-full min-w-0 border border-gray-200 dark:border-gray-700 ${
                        field.isDefault
                          ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                          : "bg-gray-50 dark:bg-gray-800 dark:text-gray-100"
                      } rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors`}
                    />
                    <div className="mt-1 text-[10px] text-gray-400">
                      {field.type ?? "custom"}
                      {!!field.required && field.isDefault && (
                        <span className="ml-1 text-red-500 font-semibold">*</span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-7 min-w-0">
                    {field.type === "date" ? (
                      <input
                        type="date"
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                      />
                    ) : field.type === "datetime" ? (
                      <input
                        type="datetime-local"
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                      />
                    ) : field.type === "number" ||
                      field.type === "integer" ||
                      field.type === "decimal" ? (
                      <input
                        type="number"
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        placeholder="0"
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                      />
                    ) : field.type === "longText" ? (
                      <textarea
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        placeholder="value"
                        rows={2}
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors resize-none"
                      />
                    ) : field.type === "boolean" ? (
                      <label className="flex items-center gap-2 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={field.value === "true"}
                          onChange={(e) =>
                            updateRow(
                              i,
                              "value",
                              e.target.checked ? "true" : "false",
                            )
                          }
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300">
                          {field.value === "true" ? "True" : "False"}
                        </span>
                      </label>
                    ) : field.type === "list" ? (
                      <select
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        disabled={(field.options?.length ?? 0) === 0}
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                      >
                        <option value="">
                          {(field.options?.length ?? 0) > 0
                            ? "Select..."
                            : "No options configured"}
                        </option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={field.value}
                        onChange={(e) => updateRow(i, "value", e.target.value)}
                        placeholder="value"
                        className="w-full min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                      />
                    )}
                  </div>

                  <div className="col-span-1 flex justify-end pt-1">
                    {!field.isDefault && (
                      <button
                        onClick={() => removeRow(i)}
                        className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            <button
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 mt-2 font-medium py-1 transition-colors"
            >
              <Plus size={12} /> Add field
            </button>
          </div>
        )}
      </div>

      {/* Metadata history */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/10">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Metadata history
        </p>
        {(historyData?.logs ?? []).length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No metadata changes yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
            {(historyData?.logs ?? []).map((log) => (
              <div
                key={log.id}
                className="text-xs rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-700 dark:text-gray-200">
                    {log.action === "file.metadata.bulk_update"
                      ? "Bulk metadata update"
                      : "Metadata update"}
                  </span>
                  <span className="text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {(log.user?.name ?? "System")} ·{" "}
                  {log.metadata?.fieldCount ?? 0} field(s)
                </div>
                {(log.metadata?.changes ?? []).length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(log.metadata?.changes ?? []).slice(0, 5).map((c, idx) => (
                      <div key={idx} className="text-[11px] text-gray-500 dark:text-gray-400">
                        {c.key}: "{c.before ?? ""}" → "{c.after ?? ""}"
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
