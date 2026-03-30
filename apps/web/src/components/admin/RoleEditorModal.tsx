import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  emptyRoleCapabilities,
  FILE_PERMISSION_OPTIONS,
  FOLDER_PERMISSION_OPTIONS,
} from "../../constants/roleCapabilities";

type BaseRole = "ORG_ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

export interface RoleEditorValue {
  id?: string;
  name: string;
  description?: string | null;
  baseRole: BaseRole;
  isSystem?: boolean;
  capabilities: Record<string, boolean>;
}

interface RoleEditorModalProps {
  open: boolean;
  title: string;
  initialRole?: RoleEditorValue | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (value: RoleEditorValue) => void;
}

function formFromInitial(initialRole: RoleEditorValue | null | undefined): RoleEditorValue {
  if (initialRole) {
    return {
      ...initialRole,
      description: initialRole.description ?? "",
      capabilities: {
        ...emptyRoleCapabilities(),
        ...initialRole.capabilities,
      },
    };
  }
  return {
    name: "",
    description: "",
    baseRole: "VIEWER",
    capabilities: emptyRoleCapabilities(),
  };
}

function RoleEditorModalInner({
  title,
  initialRole,
  isSaving = false,
  onClose,
  onSave,
}: Omit<RoleEditorModalProps, "open">) {
  const [form, setForm] = useState<RoleEditorValue>(() =>
    formFromInitial(initialRole),
  );

  const toggleCapability = (key: string) => {
    setForm((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        [key]: !current.capabilities[key],
      },
    }));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use the same permission set available in sharing.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid flex-1 gap-5 overflow-y-auto px-5 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Role name
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="e.g. Contract Reviewer"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </label>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder="What this role is for"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Base role
                </label>
                <select
                  value={form.baseRole}
                  disabled={form.isSystem}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      baseRole: e.target.value as BaseRole,
                    }))
                  }
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="EDITOR">Editor</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ORG_ADMIN">Org Admin</option>
                </select>
                {form.isSystem && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Built-in roles keep their system hierarchy.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/40">
              <div className="grid gap-5 md:grid-cols-2">
                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Folder Permissions
                  </h3>
                  <div className="space-y-2">
                    {FOLDER_PERMISSION_OPTIONS.map((option) => (
                      <label
                        key={option.key}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-white dark:text-gray-300 dark:hover:bg-gray-900"
                      >
                        <input
                          type="checkbox"
                          checked={form.capabilities[option.key] === true}
                          onChange={() => toggleCapability(option.key)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">
                    File Permissions
                  </h3>
                  <div className="space-y-2">
                    {FILE_PERMISSION_OPTIONS.map((option) => (
                      <label
                        key={option.key}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-white dark:text-gray-300 dark:hover:bg-gray-900"
                      >
                        <input
                          type="checkbox"
                          checked={form.capabilities[option.key] === true}
                          onChange={() => toggleCapability(option.key)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600"
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4 dark:border-gray-800">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              disabled={isSaving || !form.name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Save role
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function RoleEditorModal({
  open,
  title,
  initialRole,
  isSaving = false,
  onClose,
  onSave,
}: RoleEditorModalProps) {
  if (!open) return null;
  return (
    <RoleEditorModalInner
      key={initialRole?.id ?? "new"}
      title={title}
      initialRole={initialRole}
      isSaving={isSaving}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
