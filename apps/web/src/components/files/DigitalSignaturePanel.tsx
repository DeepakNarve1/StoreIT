import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  PenTool,
  PlayCircle,
  Signature,
  StopCircle,
  X,
} from "lucide-react";
import api from "../../api/axios";
import { getAuditActionLabel } from "../../utils/auditAction";
import { useToast } from "../ui/toastStore";
import { useAuthStore } from "../../store/authStore";

type SignatureStepRow = {
  id: string;
  stepOrder: number;
  status: string;
  note?: string | null;
  signerName?: string;
  signerEmail?: string;
  signerUser?: { name?: string | null; email?: string | null } | null;
};

type SignatureActionLog = {
  id: string;
  action: string;
  createdAt: string;
  note?: string | null;
  user?: { name?: string } | null;
};

type SignatureWorkflow = {
  id: string;
  fileId: string;
  status: string;
  signatureMode?: "sequential" | "parallel";
  currentStepOrder?: number | null;
  owner?: { name?: string | null } | null;
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
  currentStep?: SignatureStepRow | null;
  permissions?: {
    canSign?: boolean;
    canCancel?: boolean;
  };
  steps: SignatureStepRow[];
  actionLogs: SignatureActionLog[];
};

type SignatureEnvelope = {
  file: { id: string; name: string };
  workflow: SignatureWorkflow | null;
};

interface SignaturePanelProps {
  file: {
    id: string;
    name: string;
  };
  onClose: () => void;
  onOpenFile?: (file: { id: string; name: string }) => void;
  onStartSignature?: (file: { id: string; name: string }) => void;
  onWorkflowChanged?: (workflow: SignatureWorkflow) => void;
  canStartSignature?: boolean;
}

function iconForLogAction(action: string): LucideIcon {
  if (action.includes("signed")) return CheckCircle2;
  if (action.includes("opened")) return PlayCircle;
  if (action.includes("cancelled")) return StopCircle;
  if (action.includes("started")) return PenTool;
  if (action.includes("completed")) return FileCheck2;
  return Clock3;
}

const statusClasses: Record<string, string> = {
  draft:
    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  in_progress:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  signed:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  cancelled:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  queued:
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  pending:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  signed_step:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
};

const statusLabel: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  signed: "Signed",
  cancelled: "Cancelled",
  queued: "Queued",
  pending: "Pending",
};

export default function DigitalSignaturePanel({
  file,
  onClose,
  onOpenFile,
  onStartSignature,
  onWorkflowChanged,
  canStartSignature = true,
}: SignaturePanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [note, setNote] = useState("");
  const [signatureMode, setSignatureMode] = useState<"typed" | "drawn">("typed");
  const [signatureName, setSignatureName] = useState(user?.name ?? "");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string>("");
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["signing-file", file.id],
    queryFn: async () => {
      const res = await api.get(`/signing/files/${file.id}`);
      return res.data as SignatureEnvelope;
    },
  });

  const workflow = data?.workflow ?? null;

  useEffect(() => {
    if (user?.name && !signatureName) {
      setSignatureName(user.name);
    }
  }, [user?.name, signatureName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f766e";
  }, [signatureMode]);

  const signMutation = useMutation({
    mutationFn: async () => {
      const payload =
        signatureMode === "typed"
          ? {
              note: note.trim() || undefined,
              signatureMethod: "typed",
              signatureName: signatureName.trim(),
              signatureData: {
                typedName: signatureName.trim(),
              },
            }
          : {
              note: note.trim() || undefined,
              signatureMethod: "drawn",
              signatureName: signatureName.trim(),
              signatureData: {
                dataUrl: drawnDataUrl,
              },
            };
      const res = await api.post(`/signing/${workflow!.id}/sign`, payload);
      return res.data as { workflow: SignatureWorkflow };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["signing-file", file.id], {
        file,
        workflow: data.workflow,
      });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["signing-inbox"] });
      onWorkflowChanged?.(data.workflow);
      setNote("");
      setDrawnDataUrl("");
      useToast.getState().add("Signature saved");
    },
    onError: (error: unknown) => {
      const msg = axios.isAxiosError(error)
        ? String(
            (error.response?.data as { error?: string } | undefined)?.error ??
              "",
          ) || "Signature action failed"
        : "Signature action failed";
      useToast.getState().add(msg, "error");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/signing/${workflow!.id}/cancel`, {
        note: note.trim() || undefined,
      });
      return res.data as { workflow: SignatureWorkflow };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["signing-file", file.id], {
        file,
        workflow: data.workflow,
      });
      queryClient.invalidateQueries({ queryKey: ["files"] });
      onWorkflowChanged?.(data.workflow);
      useToast.getState().add("Signing workflow cancelled");
    },
    onError: () =>
      useToast.getState().add("Failed to cancel signing workflow", "error"),
  });

  const currentStep = workflow?.currentStep ?? null;
  const canSign = workflow?.permissions?.canSign;
  const canCancel = workflow?.permissions?.canCancel;
  const wfStatus = workflow?.status ?? "draft";
  const drawnPreview = useMemo(
    () => (signatureMode === "drawn" ? drawnDataUrl : ""),
    [drawnDataUrl, signatureMode],
  );

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    setDrawing(true);
  };

  const paint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    ctx.stroke();
    setDrawnDataUrl(canvas.toDataURL("image/png"));
  };

  const endStroke = () => {
    setDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnDataUrl("");
  };

  const signatureReady =
    signatureName.trim().length > 0 &&
    (signatureMode === "typed" || drawnDataUrl.length > 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="h-full w-full max-w-2xl border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Digital signature
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
                Loading signature workflow...
              </div>
            ) : !workflow ? (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-5 py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                  <Signature size={22} />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  No signing workflow yet
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Start a sequential or parallel signing flow for this file.
                </p>
                {canStartSignature ? (
                  <button
                    onClick={() => onStartSignature?.(file)}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium"
                  >
                    <PenTool size={15} /> Start signing
                  </button>
                ) : (
                  <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    You can view signing details, but you do not have permission to start one.
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
                    <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenFile?.({ id: file.id, name: file.name })}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ExternalLink size={14} /> Open file
                  </button>
                  </div>
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
                        Current signer
                      </p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {currentStep?.signerUser?.name ?? currentStep?.signerName ?? (workflow.status === "signed" ? "Workflow completed" : workflow.status === "cancelled" ? "Workflow cancelled" : "Not started")}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-3 py-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Signing mode
                      </p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {workflow.signatureMode === "parallel"
                          ? "Parallel"
                          : "Sequential"}
                      </p>
                    </div>
                  </div>
                </div>

                {canSign && workflow.status === "in_progress" && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Sign this document
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Type your name or draw a signature, then submit it.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <button
                        onClick={() => setSignatureMode("typed")}
                        className={`rounded-xl border px-3 py-2 text-left text-xs ${
                          signatureMode === "typed"
                            ? "border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-200"
                            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        Typed signature
                      </button>
                      <button
                        onClick={() => setSignatureMode("drawn")}
                        className={`rounded-xl border px-3 py-2 text-left text-xs ${
                          signatureMode === "drawn"
                            ? "border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-200"
                            : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        Draw signature
                      </button>
                    </div>

                    <input
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      placeholder="Type your name"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                    />

                    {signatureMode === "drawn" && (
                      <div className="space-y-2">
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                          <canvas
                            ref={canvasRef}
                            width={640}
                            height={220}
                            className="w-full h-[220px] touch-none"
                            onPointerDown={beginStroke}
                            onPointerMove={paint}
                            onPointerUp={endStroke}
                            onPointerLeave={endStroke}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Draw inside the box above.
                          </p>
                          <button
                            onClick={clearCanvas}
                            className="text-xs text-gray-700 dark:text-gray-300 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                        {drawnPreview && (
                          <p className="text-[10px] text-gray-400 break-all">
                            Signature captured
                          </p>
                        )}
                      </div>
                    )}

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
                          onClick={() => cancelMutation.mutate()}
                          disabled={cancelMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        >
                          <StopCircle size={15} /> Cancel workflow
                        </button>
                      )}
                      <button
                        onClick={() => signMutation.mutate()}
                        disabled={!signatureReady || signMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
                      >
                        <CheckCircle2 size={15} /> Sign document
                      </button>
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
                    {workflow.steps.map((step: SignatureStepRow) => (
                      <div
                        key={step.id}
                        className={`rounded-xl border px-3 py-3 ${
                          step.status === "pending"
                            ? "border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-900/20"
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
                                {step.signerUser?.name ?? step.signerName ?? "Signer"}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {step.signerUser?.email ?? step.signerEmail}
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
                      workflow.actionLogs.map((log: SignatureActionLog) => {
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
