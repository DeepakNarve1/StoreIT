import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, PenTool, X, User, Mail } from "lucide-react";
import axios from "axios";
import api from "../../api/axios";
import { useToast } from "../ui/toastStore";

type InternalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type SignerRow =
  | {
      id: string;
      type: "internal";
      userId: string;
    }
  | {
      id: string;
      type: "external";
      name: string;
      email: string;
    };

interface DigitalSignatureComposerModalProps {
  file: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onSuccess?: (workflow: {
    id: string;
    fileId?: string;
    status?: string;
    signatureMode?: "sequential" | "parallel";
    file?: {
      id: string;
      name: string;
      signatureStatus?: string | null;
      signatureNote?: string | null;
      signedAt?: string | null;
      signedBy?: { name?: string | null } | null;
      activeSignatureWorkflowId?: string | null;
      currentSignatureStepOrder?: number | null;
    } | null;
  }) => void;
}

const emptyId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function DigitalSignatureComposerModal({
  file,
  onClose,
  onSuccess,
}: DigitalSignatureComposerModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [note, setNote] = useState("");
  const [signers, setSigners] = useState<SignerRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["signature-signers"],
    queryFn: async () => {
      const res = await api.get("/workflow/approvers");
      return res.data as { users: InternalUser[] };
    },
  });

  const users = useMemo(() => data?.users ?? [], [data]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        signers: signers.map((signer) =>
          signer.type === "internal"
            ? { userId: signer.userId }
            : { name: signer.name.trim(), email: signer.email.trim() },
        ),
        signatureMode: mode,
        note: note.trim() || undefined,
      };
      const res = await api.post(`/signing/files/${file.id}/start`, payload);
      return res.data as {
        workflow: {
          id: string;
          fileId?: string;
          status?: string;
          signatureMode?: "sequential" | "parallel";
          file?: {
            id: string;
            name: string;
            signatureStatus?: string | null;
            signatureNote?: string | null;
            signedAt?: string | null;
            signedBy?: { name?: string | null } | null;
            activeSignatureWorkflowId?: string | null;
            currentSignatureStepOrder?: number | null;
          } | null;
        };
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["signing-file", file.id] });
      queryClient.invalidateQueries({ queryKey: ["signing-inbox"] });
      useToast.getState().add("Signature workflow started");
      onSuccess?.(data.workflow);
      onClose();
    },
    onError: (error: unknown) => {
      const msg = axios.isAxiosError(error)
        ? String(
            (error.response?.data as { error?: string } | undefined)?.error ??
              "",
          ) || "Failed to start signing workflow"
        : "Failed to start signing workflow";
      useToast.getState().add(msg, "error");
    },
  });

  const selectedUsers = signers
    .filter((signer): signer is Extract<SignerRow, { type: "internal" }> => signer.type === "internal")
    .map((signer) => signer.userId);
  const availableUsers = users.filter((user) => !selectedUsers.includes(user.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Request digital signature
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

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-xl border border-teal-100 dark:border-teal-900/60 bg-teal-50/70 dark:bg-teal-900/20 px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-teal-900 dark:text-teal-200">
                Signing mode
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("sequential")}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    mode === "sequential"
                      ? "border-teal-400 bg-white/80 dark:bg-teal-900/40 text-teal-900 dark:text-teal-200"
                      : "border-teal-200/80 dark:border-teal-800 text-teal-800 dark:text-teal-300"
                  }`}
                >
                  <p className="font-semibold">Sequential</p>
                  <p className="mt-0.5">Signers act one after another</p>
                </button>
                <button
                  onClick={() => setMode("parallel")}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    mode === "parallel"
                      ? "border-teal-400 bg-white/80 dark:bg-teal-900/40 text-teal-900 dark:text-teal-200"
                      : "border-teal-200/80 dark:border-teal-800 text-teal-800 dark:text-teal-300"
                  }`}
                >
                  <p className="font-semibold">Parallel</p>
                  <p className="mt-0.5">Everyone can sign independently</p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <button
                onClick={() =>
                  setSigners((prev) => [
                    ...prev,
                    { id: emptyId(), type: "internal", userId: "" },
                  ])
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <User size={15} /> Add internal signer
              </button>
              <button
                onClick={() =>
                  setSigners((prev) => [
                    ...prev,
                    { id: emptyId(), type: "external", name: "", email: "" },
                  ])
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Mail size={15} /> Add external signer
              </button>
              <button
                onClick={() => setNote("")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Clear note
              </button>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {isLoading ? "Loading users..." : "Select internal user"}
                </option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (!selectedUserId) return;
                  setSigners((prev) => [
                    ...prev,
                    { id: emptyId(), type: "internal", userId: selectedUserId },
                  ]);
                  setSelectedUserId("");
                }}
                disabled={!selectedUserId}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium"
              >
                <Plus size={15} /> Add selected user
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Signers
                </p>
              </div>
              <div className="p-4 space-y-3">
                {signers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Add at least one signer to start the workflow.
                  </p>
                ) : (
                  signers.map((signer, index) => {
                    return (
                      <div
                        key={signer.id}
                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-3 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-semibold">
                            {index + 1}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() =>
                                setSigners((prev) => {
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
                                setSigners((prev) => {
                                  if (index === prev.length - 1) return prev;
                                  const next = [...prev];
                                  [next[index + 1], next[index]] = [
                                    next[index],
                                    next[index + 1],
                                  ];
                                  return next;
                                })
                              }
                              disabled={index === signers.length - 1}
                              className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              onClick={() =>
                                setSigners((prev) =>
                                  prev.filter((_, currentIndex) => currentIndex !== index),
                                )
                              }
                              className="px-2.5 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        {signer.type === "internal" ? (
                          <select
                            value={signer.userId}
                            onChange={(e) =>
                              setSigners((prev) =>
                                prev.map((row) =>
                                  row.id === signer.id
                                    ? { ...row, userId: e.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Select internal user</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} ({user.email})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              value={signer.name}
                              onChange={(e) =>
                                setSigners((prev) =>
                                  prev.map((row) =>
                                    row.id === signer.id
                                      ? { ...row, name: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Signer name"
                              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                            />
                            <input
                              value={signer.email}
                              onChange={(e) =>
                                setSigners((prev) =>
                                  prev.map((row) =>
                                    row.id === signer.id
                                      ? { ...row, email: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Signer email"
                              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Optional note
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add context for the signing request"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800">
            <button
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 sm:w-auto"
            >
              Cancel
            </button>
            <button
              onClick={() => startMutation.mutate()}
              disabled={signers.length === 0 || startMutation.isPending || signers.some((s) => s.type === "internal" && !s.userId) || signers.some((s) => s.type === "external" && (!s.name.trim() || !s.email.trim()))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 sm:w-auto"
            >
              <PenTool size={15} />
              {startMutation.isPending ? "Starting..." : "Start signing"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
