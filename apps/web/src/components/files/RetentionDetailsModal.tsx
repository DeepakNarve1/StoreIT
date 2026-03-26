import { X, Clock3, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { RetentionAction } from "./RetentionModal";
import { useToast } from "../ui/Toast";

type RetentionJobForDetails = {
  id: string;
  scope: "file" | "folder";
  action: RetentionAction;
  resourceIds: string[];
  applyAt: number | null; // epoch ms (null = Infinite)
  createdAt: number; // epoch ms
  retention: string;
  reminder?: string | null;
  reminderAt?: number | null;
};

type Props = {
  file: { id: string; name: string } | null;
  job: RetentionJobForDetails | null;
  onClose: () => void;
  onEdit: () => void;
};

function formatDetailedDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatAction(action: RetentionAction) {
  return action === "move_to_trash" ? "Move to trash" : "Permanently delete";
}

export default function RetentionDetailsModal({
  file,
  job,
  onClose,
  onEdit,
}: Props) {
  const { add } = useToast();

  const title = useMemo(() => {
    if (file?.name) return `Retention: ${file.name}`;
    return "Retention details";
  }, [file?.name]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-xl w-full max-w-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-purple-50 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
              <Clock3 size={16} className="text-purple-700 dark:text-purple-300" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {job ? "Current scheduled policy" : "No retention scheduled"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            aria-label="Close retention details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 p-4">
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">
                  Status
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {job ? (job.applyAt === null ? "Infinite" : "Scheduled") : "Not scheduled"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">
                  Action
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {job ? formatAction(job.action) : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">
                  Timing
                </span>
                <span className="text-gray-900 dark:text-white font-medium text-right">
                  {job
                    ? job.applyAt === null
                      ? "Infinite"
                      : formatDetailedDateTime(job.applyAt)
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">
                  Created
                </span>
                <span className="text-gray-900 dark:text-white font-medium text-right">
                  {job ? formatDetailedDateTime(job.createdAt) : "—"}
                </span>
              </div>
            </div>
          </div>

            {job?.applyAt !== null && job?.retention === "7d" && !job?.reminder && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">
                  Notification timeline
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  Day 1 / 3 / 5 / 7
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Day 7</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    Delete: {formatDetailedDateTime(job.applyAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Day 5</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    Notify:{" "}
                    {formatDetailedDateTime(job.createdAt + 5 * 24 * 60 * 60 * 1000)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Day 3</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    Notify:{" "}
                    {formatDetailedDateTime(job.createdAt + 3 * 24 * 60 * 60 * 1000)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400">Day 1</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    Notify:{" "}
                    {formatDetailedDateTime(job.createdAt + 1 * 24 * 60 * 60 * 1000)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {job?.applyAt !== null && job?.reminder && job.reminder !== "none" && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400">Reminder</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {job.reminder === "custom" && job.reminderAt
                    ? formatDetailedDateTime(job.reminderAt)
                    : job.reminder && job.applyAt
                    ? (() => {
                        const m = String(job.reminder).match(/^(\d+)d$/);
                        if (m) {
                          const days = Number(m[1]);
                          return formatDetailedDateTime(job.applyAt - days * 24 * 60 * 60 * 1000);
                        }
                        return "—";
                      })()
                    : "—"}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-between">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {job
                ? "Edit updates the scheduled timing in this workspace."
                : "You can set a retention policy for this file."}
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => {
                  // Small hint in case the user clicks "edit" without a job.
                  if (!job) add("No current retention found. Opening scheduler...", "info");
                  onEdit();
                }}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm"
              >
                <Pencil size={14} />
                {job ? "Edit retention" : "Set retention"}
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <Trash2 size={14} className="mt-0.5" />
            <span>
              This retention feature schedules actions locally (workspace) and applies the delete/move at the scheduled time.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

