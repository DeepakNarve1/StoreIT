import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Save,
  X,
  Tag,
  ChevronDown,
  Loader2,
  LayoutTemplate,
} from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/Toast";

interface Props {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

type FieldType = "text" | "number" | "date" | "boolean";

interface MetaField {
  key: string;
  value: string;
  type?: FieldType;
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

  const { data: templatesData } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await api.get("/templates");
      return res.data as {
        templates: {
          id: string;
          name: string;
          fields: { key: string; type: FieldType }[];
        }[];
      };
    },
  });

  const [fields, setFields] = useState<MetaField[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

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
      add("Metadata saved", "success");
      onClose();
    },
    onError: () => add("Failed to save metadata", "error"),
  });

  const addRow = () => setFields([...fields, { key: "", value: "" }]);
  const removeRow = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) => {
    const next = [...fields];
    next[i] = { ...next[i], [field]: val };
    setFields(next);
  };

  const applyTemplate = (templateId: string) => {
    if (!templateId) return;
    const template = templatesData?.templates.find((t) => t.id === templateId);
    if (!template) return;

    const newFields = [...fields];
    let added = 0;
    template.fields.forEach((tf) => {
      if (
        !newFields.some((nf) => nf.key.toLowerCase() === tf.key.toLowerCase())
      ) {
        newFields.push({ key: tf.key, value: "", type: tf.type });
        added++;
      }
    });

    if (added > 0) {
      setFields(newFields);
      add(
        `Applied ${added} field${added !== 1 ? "s" : ""} from template`,
        "success",
      );
    } else {
      add("All fields from this template are already present", "info");
    }
    setShowTemplates(false);
  };

  const templates = templatesData?.templates ?? [];

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

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-600 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <LayoutTemplate
                  size={13}
                  className="text-purple-500 dark:text-purple-400 shrink-0"
                />
                Apply a template…
              </span>
              <ChevronDown
                size={13}
                className={`text-gray-400 transition-transform duration-200 ${showTemplates ? "rotate-180" : ""}`}
              />
            </button>
            {showTemplates && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTemplates(false)}
                />
                <div className="absolute top-full mt-1 left-0 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors text-left"
                    >
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-gray-400 shrink-0">
                        {t.fields.length} field
                        {t.fields.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </>
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
                  className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                />
                {field.type === "date" ? (
                  <input
                    type="date"
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent transition-colors"
                  />
                ) : field.type === "number" ? (
                  <input
                    type="number"
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    placeholder="0"
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                  />
                ) : (
                  <input
                    value={field.value}
                    onChange={(e) => updateRow(i, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 min-w-0 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                  />
                )}
                <button
                  onClick={() => removeRow(i)}
                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                >
                  <Trash2 size={12} />
                </button>
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
