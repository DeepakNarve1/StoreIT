import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Workflow, X } from "lucide-react";
import axios from "axios";
import type { StartedApprovalWorkflow } from "../../types/workflow";
import api from "../../api/axios";
import { useToast } from "../ui/toastStore";

interface ApprovalWorkflowComposerModalProps {
  file: {
    id: string;
    name: string;
  };
  initialApproverUserIds?: string[];
  onClose: () => void;
  onSuccess?: (workflow: StartedApprovalWorkflow) => void;
}

export default function ApprovalWorkflowComposerModal({
  file,
  initialApproverUserIds = [],
  onClose,
  onSuccess,
}: ApprovalWorkflowComposerModalProps) {
  const queryClient = useQueryClient();
  const [selectedApproverId, setSelectedApproverId] = useState("");
  const [approverIds, setApproverIds] = useState<string[]>(() => [
    ...initialApproverUserIds,
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-approvers"],
    queryFn: async () => {
      const res = await api.get("/workflow/approvers");
      return res.data as {
        users: Array<{
          id: string;
          name: string;
          email: string;
          role: string;
        }>;
      };
    },
  });

  const users = useMemo(() => data?.users ?? [], [data]);
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users],
  );

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/workflow/files/${file.id}/start`, {
        approverUserIds: approverIds,
      });
      return res.data as { workflow: StartedApprovalWorkflow };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["workflow-file", file.id] });
      queryClient.invalidateQueries({ queryKey: ["workflow-inbox"] });
      useToast.getState().add("Approval workflow started");
      onSuccess?.(data.workflow);
      onClose();
    },
    onError: (error: unknown) => {
      const msg = axios.isAxiosError(error)
        ? String(
            (error.response?.data as { error?: string } | undefined)?.error ??
              "",
          ) || "Failed to start workflow"
        : "Failed to start workflow";
      useToast.getState().add(msg, "error");
    },
  });

  const availableUsers = users.filter((user) => !approverIds.includes(user.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Start approval workflow
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
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

          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-900/20 px-4 py-3">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Sequential approvals
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Approvers act one after another. Rejecting stops the workflow and
                sends the file back to draft.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={selectedApproverId}
                onChange={(e) => setSelectedApproverId(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {isLoading ? "Loading approvers..." : "Select approver"}
                </option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedApproverId) return;
                  setApproverIds((prev) => [...prev, selectedApproverId]);
                  setSelectedApproverId("");
                }}
                disabled={!selectedApproverId}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium"
              >
                <Plus size={15} /> Add approver
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Approval steps
                </p>
              </div>
              <div className="p-4 space-y-2">
                {approverIds.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add at least one approver to start the workflow.
                  </p>
                ) : (
                  approverIds.map((userId, index) => {
                    const user = userById.get(userId);
                    return (
                      <div
                        key={`${userId}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-semibold">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {user?.name ?? "Unknown user"}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user?.email ?? ""} {user?.role ? `- ${user.role}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              setApproverIds((prev) => {
                                if (index === 0) return prev;
                                const next = [...prev];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                return next;
                              })
                            }
                            disabled={index === 0}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            onClick={() =>
                              setApproverIds((prev) => {
                                if (index === prev.length - 1) return prev;
                                const next = [...prev];
                                [next[index + 1], next[index]] = [
                                  next[index],
                                  next[index + 1],
                                ];
                                return next;
                              })
                            }
                            disabled={index === approverIds.length - 1}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            onClick={() =>
                              setApproverIds((prev) =>
                                prev.filter((_, currentIndex) => currentIndex !== index),
                              )
                            }
                            className="px-2.5 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => startMutation.mutate()}
              disabled={approverIds.length === 0 || startMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium"
            >
              <Workflow size={15} />
              {startMutation.isPending ? "Starting..." : "Start workflow"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
