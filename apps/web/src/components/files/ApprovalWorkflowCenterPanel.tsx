import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, FolderOpen, Search, Workflow, X } from "lucide-react";
import type { WorkflowListItem } from "../../types/workflow";
import api from "../../api/axios";

interface ApprovalWorkflowCenterPanelProps {
  onClose: () => void;
  onOpenWorkflow: (file: { id: string; name: string }) => void;
}

const statusClasses: Record<string, string> = {
  in_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  approved:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  rejected:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function ApprovalWorkflowCenterPanel({
  onClose,
  onOpenWorkflow,
}: ApprovalWorkflowCenterPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_review" | "approved" | "rejected" | "cancelled"
  >("all");

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-list"],
    queryFn: async () => {
      const res = await api.get("/workflow");
      return res.data as { workflows: WorkflowListItem[] };
    },
  });

  const workflows = useMemo(() => data?.workflows ?? [], [data]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredWorkflows = useMemo(
    () =>
      workflows.filter((workflow) => {
        const matchesStatus =
          statusFilter === "all" || workflow.status === statusFilter;
        if (!matchesStatus) return false;
        if (!normalizedSearch) return true;

        const haystack = [
          workflow.file?.name,
          workflow.owner?.name,
          workflow.currentStep?.approver?.name,
          workflow.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      }),
    [normalizedSearch, statusFilter, workflows],
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="h-full w-full max-w-2xl border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                All workflows
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Review workflows across all files
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3">
              <label className="relative block">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by file, owner, approver"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as
                      | "all"
                      | "in_review"
                      | "approved"
                      | "rejected"
                      | "cancelled",
                  )
                }
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="all">All statuses</option>
                <option value="in_review">In review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {isLoading ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                Loading workflows...
              </div>
            ) : workflows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-5 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  <Workflow size={22} />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  No workflows yet
                </p>
              </div>
            ) : filteredWorkflows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-5 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300">
                  <Search size={20} />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  No workflows match this filter
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWorkflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    onClick={() => {
                      const fid = workflow.file?.id;
                      const fname = workflow.file?.name;
                      if (!fid || !fname) return;
                      onOpenWorkflow({ id: fid, name: fname });
                    }}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-primary-700 px-3.5 py-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {workflow.file?.name ?? "Unknown file"}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {workflow.owner?.name ?? "Unknown"} ·{" "}
                          {workflow.currentStep?.approver?.name ?? "No approver"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          statusClasses[workflow.status] ?? statusClasses.draft
                        }`}
                      >
                        {workflow.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                      <div className="inline-flex items-center gap-1.5 truncate">
                        <FolderOpen size={13} />
                        <span className="truncate">
                          Current: {workflow.currentStep?.approver?.name ?? "None"}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <Workflow size={13} />
                        Steps: {workflow.steps?.length ?? 0}
                      </div>
                      <div className="inline-flex items-center gap-1.5 truncate">
                        <Clock3 size={13} />
                        <span className="truncate">
                          Updated:{" "}
                          {workflow.updatedAt
                            ? new Date(workflow.updatedAt).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
