import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  PlayCircle,
  RotateCcw,
  StopCircle,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import type {
  FileWorkflowEnvelope,
  WorkflowActionLog,
  WorkflowStepRow,
  WorkflowWithFile,
} from "../../types/workflow";
import api from "../../api/axios";
import { getAuditActionLabel } from "../../utils/auditAction";
import { useToast } from "../ui/toastStore";

interface ApprovalWorkflowPanelProps {
  file: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onStartWorkflow?: (templateApproverUserIds?: string[]) => void;
  onWorkflowChanged?: (workflow: WorkflowWithFile) => void;
  canStartWorkflow?: boolean;
}

function iconForLogAction(action: string): LucideIcon {
  if (action.includes("approved")) return CheckCircle2;
  if (action.includes("rejected")) return XCircle;
  if (action.includes("opened")) return PlayCircle;
  if (action.includes("cancelled")) return StopCircle;
  if (action.includes("started")) return Workflow;
  if (action.includes("completed")) return FileCheck2;
  return Clock3;
}

const statusClasses: Record<string, string> = {
  draft:
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  in_review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  approved:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  rejected:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800",
  cancelled:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  queued:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  skipped:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

const statusLabel: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  queued: "Queued",
  pending: "Pending",
  skipped: "Skipped",
};

export default function ApprovalWorkflowPanel({
  file,
  onClose,
  onStartWorkflow,
  onWorkflowChanged,
  canStartWorkflow = true,
}: ApprovalWorkflowPanelProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-file", file.id],
    queryFn: async () => {
      const res = await api.get(`/workflow/files/${file.id}`);
      return res.data as FileWorkflowEnvelope;
    },
  });

  const workflow = data?.workflow ?? null;

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      workflowId,
      payload,
    }: {
      action: "approve" | "reject" | "cancel";
      workflowId: string;
      payload: { note?: string };
    }) => {
      const res = await api.post(`/workflow/${workflowId}/${action}`, payload);
      return res.data as { workflow: WorkflowWithFile };
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["workflow-file", file.id], {
        workflow: data.workflow,
        file: data.workflow.file,
      });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-inbox"] });
      onWorkflowChanged?.(data.workflow);
      setNote("");
      useToast
        .getState()
        .add(
          variables.action === "approve"
            ? "Workflow step approved"
            : variables.action === "reject"
              ? "Workflow rejected"
              : "Workflow cancelled",
        );
    },
    onError: (error: unknown) => {
      const msg = axios.isAxiosError(error)
        ? String(
            (error.response?.data as { error?: string } | undefined)?.error ??
              "",
          ) || "Workflow action failed"
        : "Workflow action failed";
      useToast.getState().add(msg, "error");
    },
  });

  const currentStep = workflow?.currentStep ?? null;
  const canApprove = workflow?.permissions?.canApprove;
  const canReject = workflow?.permissions?.canReject;
  const canCancel = workflow?.permissions?.canCancel;
  const wfStatus = workflow?.status ?? "draft";

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="h-full w-full max-w-2xl border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Approval workflow
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[18rem]">
                {file.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {isLoading ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                Loading workflow...
              </div>
            ) : !workflow ? (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-5 py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  <Workflow size={22} />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  No approval workflow yet
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Start a sequential approval flow for this file.
                </p>
                {canStartWorkflow ? (
                  <button
                    onClick={() => onStartWorkflow?.()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium"
                  >
                    <Workflow size={15} /> Start workflow
                  </button>
                ) : (
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    You can view workflows, but you don’t have permission to start one.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[wfStatus] ?? statusClasses.draft}`}
                    >
                      {statusLabel[wfStatus] ?? wfStatus}
                    </span>
                    {(workflow.status === "approved" ||
                      workflow.status === "rejected" ||
                      workflow.status === "cancelled") && (
                      canStartWorkflow && (
                        <button
                          onClick={() =>
                            onStartWorkflow?.(
                              workflow.templateApproverUserIds ?? [],
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <RotateCcw size={14} /> Start again
                        </button>
                      )
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Workflow owner
                      </p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {workflow.owner?.name ?? "Unknown"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Current approver
                      </p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {currentStep?.approver?.name ??
                          (workflow.status === "approved"
                            ? "Workflow completed"
                            : workflow.status === "rejected"
                              ? "Workflow rejected"
                              : workflow.status === "cancelled"
                                ? "Workflow cancelled"
                                : "Not started")}
                      </p>
                    </div>
                  </div>
                </div>

                {(canApprove || canReject || canCancel) && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Workflow action
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Leave a note if you want to explain the decision.
                      </p>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Optional note"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      {canCancel && (
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              action: "cancel",
                              workflowId: workflow.id,
                              payload: { note },
                            })
                          }
                          disabled={actionMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        >
                          <StopCircle size={15} /> Cancel workflow
                        </button>
                      )}
                      {canReject && (
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              action: "reject",
                              workflowId: workflow.id,
                              payload: { note },
                            })
                          }
                          disabled={actionMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                        >
                          <XCircle size={15} /> Reject
                        </button>
                      )}
                      {canApprove && (
                        <button
                          onClick={() =>
                            actionMutation.mutate({
                              action: "approve",
                              workflowId: workflow.id,
                              payload: { note },
                            })
                          }
                          disabled={actionMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                        >
                          <CheckCircle2 size={15} /> Approve
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Steps
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    {workflow.steps.map((step: WorkflowStepRow) => (
                      <div
                        key={step.id}
                        className={`rounded-xl border px-3 py-3 ${
                          step.status === "pending"
                            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-semibold">
                              {step.stepOrder}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {step.approver?.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {step.approver?.email}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses[step.status] ?? statusClasses.queued}`}
                          >
                            {statusLabel[step.status] ?? step.status}
                          </span>
                        </div>
                        {step.note && (
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">
                            {step.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Timeline
                    </p>
                  </div>
                  <div className="p-4 space-y-2">
                    {workflow.actionLogs.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No workflow events yet.
                      </p>
                    ) : (
                      workflow.actionLogs.map((log: WorkflowActionLog) => {
                        const Icon = iconForLogAction(log.action);

                        return (
                          <div
                            key={log.id}
                            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 text-primary-600 dark:text-primary-300">
                                <Icon size={16} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {getAuditActionLabel(log.action)}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {log.user?.name ?? "System"} -{" "}
                                  {new Date(log.createdAt).toLocaleString()}
                                </p>
                                {log.note && (
                                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                                    {log.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
