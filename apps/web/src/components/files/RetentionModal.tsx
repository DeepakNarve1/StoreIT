import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "../ui/Toast";

export type RetentionAction = "move_to_trash" | "permanent_delete";

type Props = {
  scope: "file" | "folder";
  count: number;
  onClose: () => void;
  onConfirm: (payload: {
    retention: string;
    retentionUntil?: string | null;
    action: RetentionAction;
    reminder?: string | null; // e.g. '1d','3d','5d','7d','custom'
    reminderAt?: string | null; // datetime-local string for custom reminder
  }) => Promise<void>;
  isConfirming?: boolean;
  initialValues?: {
    retention: string;
    retentionUntil?: string | null;
    action: RetentionAction;
  };
};

const RETENTION_PRESETS: Array<{
  label: string;
  value: string;
  untilType: "none" | "custom";
}> = [
  { label: "Infinite", value: "infinite", untilType: "none" },
  { label: "7 days", value: "7d", untilType: "none" },
  { label: "30 days", value: "30d", untilType: "none" },
  { label: "90 days", value: "90d", untilType: "none" },
  { label: "Custom date", value: "custom", untilType: "custom" },
];

const REMINDER_PRESETS: Array<{ label: string; value: string; untilType?: "none" | "custom" }> = [
  { label: "None", value: "none", untilType: "none" },
  { label: "1 day before", value: "1d", untilType: "none" },
  { label: "3 days before", value: "3d", untilType: "none" },
  { label: "5 days before", value: "5d", untilType: "none" },
  { label: "7 days before", value: "7d", untilType: "none" },
  { label: "Custom time", value: "custom", untilType: "custom" },
];

function formatScope(scope: "file" | "folder") {
  return scope === "file" ? "file(s)" : "folder(s)";
}

export default function RetentionModal({
  scope,
  count,
  onClose,
  onConfirm,
  isConfirming = false,
  initialValues,
}: Props) {
  const { add } = useToast();

  const [retentionValue, setRetentionValue] = useState<string>(
    initialValues?.retention ?? RETENTION_PRESETS[0]?.value ?? "infinite",
  );
  const [customUntil, setCustomUntil] = useState<string>(
    initialValues?.retentionUntil ?? "",
  );
  const [reminderValue, setReminderValue] = useState<string>(
    // default to none
    "none",
  );
  const [customReminderAt, setCustomReminderAt] = useState<string>("");
  const [action, setAction] = useState<RetentionAction>(
    initialValues?.action ?? "move_to_trash",
  );

  // When opening for edit, the modal might be mounted with new initialValues.
  useEffect(() => {
    if (!initialValues) return;
    setRetentionValue(initialValues.retention);
    setCustomUntil(initialValues.retentionUntil ?? "");
    setAction(initialValues.action);
    // If opening for edit, the modal might include reminder fields in future.
  }, [initialValues]);

  const retentionPreset = useMemo(
    () => RETENTION_PRESETS.find((p) => p.value === retentionValue),
    [retentionValue],
  );

  const reminderPreset = useMemo(
    () => REMINDER_PRESETS.find((p) => p.value === reminderValue),
    [reminderValue],
  );

  const requireUntil = retentionPreset?.untilType === "custom";
  const requireReminderAt = reminderPreset?.untilType === "custom";

  const canConfirm = useMemo(() => {
    if (action !== "move_to_trash" && action !== "permanent_delete")
      return false;
    if (requireUntil) return !!customUntil;
    if (requireReminderAt) return !!customReminderAt;
    return true;
  }, [action, customUntil, requireUntil]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
              R
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                Retention
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Apply to {count} {formatScope(scope)}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            aria-label="Close retention modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Retention policy
            </div>
            <select
              value={retentionValue}
              onChange={(e) => setRetentionValue(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
            >
              {RETENTION_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {requireUntil && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Until (date & time)
              </div>
              <input
                type="datetime-local"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          )}

          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Reminder
            </div>
            <select
              value={reminderValue}
              onChange={(e) => setReminderValue(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
            >
              {REMINDER_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {requireReminderAt && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Reminder time (date & time)
              </div>
              <input
                type="datetime-local"
                value={customReminderAt}
                onChange={(e) => setCustomReminderAt(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Action
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction("move_to_trash")}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors text-left ${
                  action === "move_to_trash"
                    ? "border-purple-300 dark:border-purple-600 bg-purple-50/60 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Move to trash
              </button>
              <button
                type="button"
                onClick={() => setAction("permanent_delete")}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors text-left ${
                  action === "permanent_delete"
                    ? "border-purple-300 dark:border-purple-600 bg-purple-50/60 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                Permanently delete
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!canConfirm) {
                add("Please complete retention fields", "error");
                return;
              }
              await onConfirm({
                retention: retentionValue,
                retentionUntil: requireUntil ? customUntil : null,
                action,
                reminder: reminderValue === "none" ? null : reminderValue,
                reminderAt: requireReminderAt ? customReminderAt : null,
              });
            }}
            disabled={isConfirming || !canConfirm}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
          >
            {isConfirming ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

