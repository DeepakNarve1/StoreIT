import { X, CheckCircle, XCircle, Clock, RotateCcw } from "lucide-react";

interface ApprovalDetailPanelProps {
  file: {
    id: string;
    name: string;
    approvalStatus?: string | null;
    approvalNote?: string | null;
    approvedAt?: string | null;
    approvedBy?: { name: string } | null;
  };
  onClose: () => void;
  onResubmit?: () => void;
}

export default function ApprovalDetailPanel({
  file,
  onClose,
  onResubmit,
}: ApprovalDetailPanelProps) {
  const status = file.approvalStatus;

  const statusConfig = {
    approved: {
      icon: CheckCircle,
      iconClass: "text-green-500",
      bgClass: "bg-green-50 dark:bg-green-900/20",
      borderClass: "border-green-200 dark:border-green-800",
      label: "Approved",
      labelClass: "text-green-700 dark:text-green-400",
    },
    rejected: {
      icon: XCircle,
      iconClass: "text-red-500",
      bgClass: "bg-red-50 dark:bg-red-900/20",
      borderClass: "border-red-200 dark:border-red-800",
      label: "Rejected",
      labelClass: "text-red-700 dark:text-red-400",
    },
    pending: {
      icon: Clock,
      iconClass: "text-amber-500",
      bgClass: "bg-amber-50 dark:bg-amber-900/20",
      borderClass: "border-amber-200 dark:border-amber-800",
      label: "Pending review",
      labelClass: "text-amber-700 dark:text-amber-400",
    },
  }[status ?? "pending"] ?? {
    icon: Clock,
    iconClass: "text-gray-400",
    bgClass: "bg-gray-50 dark:bg-gray-800",
    borderClass: "border-gray-200 dark:border-gray-700",
    label: "No status",
    labelClass: "text-gray-500",
  };

  const { icon: StatusIcon } = statusConfig;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Approval details
              </p>
              <p className="text-xs text-gray-400 truncate max-w-52 mt-0.5">
                {file.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Status block */}
          <div
            className={`mx-4 mt-4 p-4 rounded-xl border ${statusConfig.bgClass} ${statusConfig.borderClass}`}
          >
            <div className="flex items-center gap-2.5 mb-1">
              <StatusIcon size={16} className={statusConfig.iconClass} />
              <span
                className={`text-sm font-semibold ${statusConfig.labelClass}`}
              >
                {statusConfig.label}
              </span>
            </div>
            {file.approvedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                {new Date(file.approvedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {file.approvedBy?.name && (
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-6 mt-0.5">
                by{" "}
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {file.approvedBy.name}
                </span>
              </p>
            )}
          </div>

          {/* Reviewer note */}
          <div className="px-4 mt-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Reviewer note
            </p>
            {file.approvalNote ? (
              <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5 border border-gray-200 dark:border-gray-700">
                {file.approvalNote}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                No note left by reviewer.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-4 mt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Close
            </button>

            {/* Resubmit button — only shown for rejected files */}
            {status === "rejected" && onResubmit && (
              <button
                onClick={() => {
                  onResubmit();
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                           bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600
                           text-white rounded-lg transition-colors"
              >
                <RotateCcw size={13} />
                Resubmit
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
