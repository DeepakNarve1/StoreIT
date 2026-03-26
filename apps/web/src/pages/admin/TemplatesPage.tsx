import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  TableProperties,
  X,
  Save,
  Loader,
  Edit2,
  AlertCircle
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { useToast } from "../../components/ui/Toast";

interface TemplateField {
  key: string;
  type: "text" | "number" | "date" | "boolean";
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  fields: { id: string; key: string; type: "text" | "number" | "date" | "boolean" }[];
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { add } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<TemplateField[]>([
    { key: "", type: "text" },
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await api.get("/templates");
      return res.data as { templates: Template[] };
    },
  });

  const templates = data?.templates ?? [];

  const openNewModal = () => {
    setEditingTemplate(null);
    setName("");
    setDescription("");
    setFields([{ key: "", type: "text" }]);
    setIsModalOpen(true);
  };

  const openEditModal = (t: Template) => {
    setEditingTemplate(t);
    setName(t.name);
    setDescription(t.description || "");
    setFields(
      t.fields.map((f) => ({ key: f.key, type: f.type as TemplateField["type"] }))
    );
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  const addField = () => setFields([...fields, { key: "", type: "text" }]);
  const removeField = (index: number) =>
    setFields(fields.filter((_, i) => i !== index));
  const updateField = (
    index: number,
    key: "key" | "type",
    val: string
  ) => {
    const next = [...fields];
    next[index] = { ...next[index], [key]: val };
    setFields(next);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validFields = fields.filter((f) => f.key.trim());
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, {
          name,
          description,
          fields: validFields,
        });
      } else {
        await api.post("/templates", {
          name,
          description,
          fields: validFields,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      add(
        editingTemplate ? "Template updated" : "Template created",
        "success"
      );
      closeModal();
    },
    onError: () => add("Failed to save template", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await api.delete(`/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      add("Template deleted", "success");
    },
    onError: () => add("Failed to delete template", "error"),
  });

  return (
    <AppShell>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TableProperties size={22} className="text-primary-500" />
              Metadata Templates
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-lg">
              Define reusable sets of custom metadata fields (like "Invoice Data" or "Contract Info") so users don't have to manually type field names.
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors"
          >
            <Plus size={16} /> Create Template
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader size={32} className="text-primary-500 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
              <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <TableProperties size={32} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                No Templates Yet
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                Create metadata templates to standardize how your organization categorizes and searches for specific types of documents.
              </p>
              <button
                onClick={openNewModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <Plus size={16} /> Create Your First Template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:shadow-md transition duration-200 flex flex-col h-full"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 line-clamp-1">
                      {t.name}
                    </h3>
                    <div className="flex items-center gap-1 -mr-2 -mt-2">
                      <button
                        onClick={() => openEditModal(t)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 rounded-md transition"
                        title="Edit Template"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this template?")) {
                            deleteMutation.mutate(t.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 rounded-md transition disabled:opacity-50"
                        title="Delete Template"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {t.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2 min-h-[40px]">
                      {t.description}
                    </p>
                  )}
                  {!t.description && <div className="h-4 mb-4" />}

                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 mt-auto border border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Fields ({t.fields.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {t.fields.map((f) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300"
                        >
                          {f.key} <span className="text-[10px] text-gray-400 font-normal">({f.type})</span>
                        </span>
                      ))}
                      {t.fields.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No fields defined</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TableProperties size={20} className="text-primary-500" />
                {editingTemplate ? "Edit Template" : "Create New Template"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Template Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Employee Onboarding"
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm placeholder-gray-400 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this template typically used for?"
                  rows={2}
                  className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm placeholder-gray-400 dark:text-white resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                    Template Fields
                  </h3>
                  <button
                    onClick={addField}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                  >
                    <Plus size={14} /> Add Field
                  </button>
                </div>

                <div className="space-y-3">
                  {fields.length === 0 && (
                     <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-900/20 dark:border-amber-800">
                       <AlertCircle size={16} className="text-amber-500 shrink-0" />
                       <p className="text-xs text-amber-700 dark:text-amber-400">
                         This template has no fields. Users won't see anything if applied. Add a field above.
                       </p>
                     </div>
                  )}

                  {fields.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1">
                        <input
                          value={f.key}
                          onChange={(e) => updateField(i, "key", e.target.value)}
                          placeholder="Field name (e.g. Total Amount)"
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm dark:text-white placeholder-gray-400"
                        />
                      </div>
                      <div className="w-32 shrink-0">
                        <select
                          value={f.type}
                          onChange={(e) => updateField(i, "type", e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm dark:text-white"
                        >
                          <option value="text">Text (ABC)</option>
                          <option value="number">Number (123)</option>
                          <option value="date">Date (📅)</option>
                        </select>
                      </div>
                      <button
                        onClick={() => removeField(i)}
                        className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 shrink-0 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-gray-800/20">
              <button
                onClick={closeModal}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm shadow-primary-500/30 disabled:opacity-50 transition"
              >
                {saveMutation.isPending ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                {saveMutation.isPending ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
