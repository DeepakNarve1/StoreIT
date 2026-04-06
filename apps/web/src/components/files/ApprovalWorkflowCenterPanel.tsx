import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, FolderOpen, Search, Signature, Workflow, X } from "lucide-react";
import api from "../../api/axios";
import type {
  SignatureWorkflowListItem,
  WorkflowCenterItem,
  WorkflowListItem,
} from "../../types/workflow";

interface WorkflowCenterPanelProps {
  onClose: () => void;
  onOpenApprovalWorkflow: (file: { id: string; name: string }) => void;
  onOpenSignatureWorkflow: (file: { id: string; name: string }) => void;
  initialTypeFilter?: "all" | "approval" | "signature";
}

type KindFilter = "all" | "approval" | "signature";
type StatusFilter = "all" | "active" | "completed" | "cancelled" | "draft";

const approvalStatusClasses: Record<string, string> = {
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

const signatureStatusClasses: Record<string, string> = {
  in_progress:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  signed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  cancelled:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  queued:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const kindClasses: Record<WorkflowCenterItem["kind"], string> = {
  approval:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  signature:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
};

function getCurrentActor(workflow: WorkflowCenterItem) {
  if (workflow.kind === "approval") {
    return workflow.currentStep?.approver?.name ?? "No approver";
  }
  return (
    workflow.currentStep?.signerUser?.name ??
    workflow.currentStep?.signerName ??
    "No signer"
  );
}

function getUpdatedAt(workflow: WorkflowCenterItem) {
  return workflow.updatedAt ?? workflow.createdAt ?? "";
}

function getStatusBucket(workflow: WorkflowCenterItem): StatusFilter {
  if (workflow.kind === "approval") {
    if (workflow.status === "approved" || workflow.status === "rejected") {
      return "completed";
    }
    if (workflow.status === "cancelled") return "cancelled";
    if (workflow.status === "draft") return "draft";
    return "active";
  }

  if (workflow.status === "signed") return "completed";
  if (workflow.status === "cancelled") return "cancelled";
  if (workflow.status === "draft") return "draft";
  return "active";
}

function getStatusLabel(workflow: WorkflowCenterItem) {
  if (workflow.kind === "approval") {
    return (
      {
        in_review: "In review",
        approved: "Approved",
        rejected: "Rejected",
        cancelled: "Cancelled",
        draft: "Draft",
      }[workflow.status] ?? workflow.status.replaceAll("_", " ")
    );
  }

  return (
    {
      in_progress: "In progress",
      signed: "Signed",
      cancelled: "Cancelled",
      draft: "Draft",
      pending: "Pending",
      queued: "Queued",
    }[workflow.status] ?? workflow.status.replaceAll("_", " ")
  );
}

function getStatusClass(workflow: WorkflowCenterItem) {
  if (workflow.kind === "approval") {
    return approvalStatusClasses[workflow.status] ?? approvalStatusClasses.draft;
  }
  return signatureStatusClasses[workflow.status] ?? signatureStatusClasses.draft;
}

export default function WorkflowCenterPanel({
  onClose,
  onOpenApprovalWorkflow,
  onOpenSignatureWorkflow,
  initialTypeFilter = "all",
}: WorkflowCenterPanelProps) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>(initialTypeFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    setKindFilter(initialTypeFilter);
  }, [initialTypeFilter]);

  const approvalQuery = useQuery({
    queryKey: ["workflow-list"],
    queryFn: async () => {
      const res = await api.get("/workflow");
      return res.data as { workflows: WorkflowListItem[] };
    },
  });

  const signatureQuery = useQuery({
    queryKey: ["signing-workflow-list"],
    queryFn: async () => {
      const res = await api.get("/signing");
      return res.data as { workflows: SignatureWorkflowListItem[] };
    },
  });

  const isLoading = approvalQuery.isLoading || signatureQuery.isLoading;
  const approvalWorkflows = approvalQuery.data?.workflows ?? [];
  const signatureWorkflows = signatureQuery.data?.workflows ?? [];

  const workflows = useMemo<WorkflowCenterItem[]>(
    () => [
      ...approvalWorkflows.map((workflow) => ({
        ...workflow,
        kind: "approval" as const,
      })),
      ...signatureWorkflows.map((workflow) => ({
        ...workflow,
        kind: "signature" as const,
      })),
    ].sort((a, b) =>
      getUpdatedAt(b).localeCompare(getUpdatedAt(a)),
    ),
    [approvalWorkflows, signatureWorkflows],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredWorkflows = useMemo(
    () =>
      workflows.filter((workflow) => {
        if (kindFilter !== "all" && workflow.kind !== kindFilter) {
          return false;
        }

        const bucket = getStatusBucket(workflow);
        if (statusFilter !== "all" && bucket !== statusFilter) {
          return false;
        }

        if (!normalizedSearch) return true;

        const haystack = [
          workflow.file?.name,
          workflow.owner?.name,
          getCurrentActor(workflow),
          workflow.kind,
          workflow.status,
          getStatusLabel(workflow),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      }),
    [kindFilter, normalizedSearch, statusFilter, workflows],
  );

  const approvalCount = approvalWorkflows.length;
  const signatureCount = signatureWorkflows.length;

  const openWorkflow = (workflow: WorkflowCenterItem) => {
    const fid = workflow.file?.id;
    const fname = workflow.file?.name;
    if (!fid || !fname) return;

    if (workflow.kind === "approval") {
      onOpenApprovalWorkflow({ id: fid, name: fname });
      return;
    }

    onOpenSignatureWorkflow({ id: fid, name: fname });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="h-full w-full max-w-2xl border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Workflows
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Review approval and signature workflows across all files
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
                  placeholder="Search by file, owner, approver, signer"
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </label>
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="all">All workflows</option>
                <option value="approval">Approvals</option>
                <option value="signature">Signatures</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px] gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setKindFilter("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    kindFilter === "all"
                      ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
                      : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setKindFilter("approval")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    kindFilter === "approval"
                      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                      : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  Approvals {approvalCount ? `(${approvalCount})` : ""}
                </button>
                <button
                  onClick={() => setKindFilter("signature")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    kindFilter === "signature"
                      ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-200"
                      : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  Signatures {signatureCount ? `(${signatureCount})` : ""}
                </button>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="draft">Draft</option>
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
                    key={`${workflow.kind}-${workflow.id}`}
                    onClick={() => openWorkflow(workflow)}
                    className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-primary-300 dark:hover:border-primary-700 px-3.5 py-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindClasses[workflow.kind]}`}
                          >
                            {workflow.kind === "approval" ? "Approval" : "Signature"}
                          </span>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {workflow.file?.name ?? "Unknown file"}
                          </p>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {workflow.owner?.name ?? "Unknown"} · {getCurrentActor(workflow)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusClass(workflow)}`}
                      >
                        {getStatusLabel(workflow)}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                      <div className="inline-flex items-center gap-1.5 truncate">
                        <FolderOpen size={13} />
                        <span className="truncate">
                          Current: {getCurrentActor(workflow)}
                        </span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        {workflow.kind === "approval" ? (
                          <Workflow size={13} />
                        ) : (
                          <Signature size={13} />
                        )}
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
