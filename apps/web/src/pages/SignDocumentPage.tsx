import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Signature, Trash2 } from "lucide-react";
import { useParams } from "react-router-dom";
import api from "../api/axios";

type SigningLinkPayload = {
  token: string;
  step: {
    id: string;
    stepOrder: number;
    signerName: string;
    signerEmail: string;
    status: string;
    workflowId: string;
  };
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    viewUrl?: string | null;
  };
  workflow: {
    id: string;
    status: string;
    signatureMode?: "sequential" | "parallel";
    steps: Array<{
      id: string;
      stepOrder: number;
      status: string;
      signerName?: string;
      signerEmail?: string;
    }>;
  };
};

export default function SignDocumentPage() {
  const { token } = useParams();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [signatureMode, setSignatureMode] = useState<"typed" | "drawn">("typed");
  const [signatureName, setSignatureName] = useState("");
  const [note, setNote] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState("");
  const [drawing, setDrawing] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-signing", token],
    enabled: !!token,
    queryFn: async () => {
      const res = await api.get(`/signing/public/${token}`);
      return res.data as SigningLinkPayload;
    },
  });

  useEffect(() => {
    if (data?.step?.signerName && !signatureName) {
      setSignatureName(data.step.signerName);
    }
  }, [data?.step?.signerName, signatureName]);

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
      if (!token) throw new Error("Missing token");
      const payload =
        signatureMode === "typed"
          ? {
              note: note.trim() || undefined,
              signatureMethod: "typed",
              signatureName: signatureName.trim(),
              signatureData: { typedName: signatureName.trim() },
            }
          : {
              note: note.trim() || undefined,
              signatureMethod: "drawn",
              signatureName: signatureName.trim(),
              signatureData: { dataUrl: drawnDataUrl },
            };
      const res = await api.post(`/signing/public/${token}/sign`, payload);
      return res.data as { workflow: SigningLinkPayload["workflow"] };
    },
  });

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

  const endStroke = () => setDrawing(false);

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

  const filePreviewUrl = data?.file.viewUrl ?? null;
  const status = data?.workflow.status ?? "loading";
  const modeLabel =
    data?.workflow.signatureMode === "parallel" ? "Parallel" : "Sequential";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-6">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Loading signing link...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-xl">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            Signing link unavailable
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This link may have expired or the workflow is no longer active.
          </p>
        </div>
      </div>
    );
  }

  if (signMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <CheckCircle2 size={26} />
          </div>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">
            Signature submitted
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Thanks. The document has been signed and the workflow has been updated.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-7 space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Sign document
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {data.file.name}
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 px-3 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Signer</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-white">
                      {data.step.signerName}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 px-3 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Mode</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-white">
                      {modeLabel}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-800 px-3 py-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-white">
                      {status === "in_progress" ? "In progress" : status}
                    </p>
                  </div>
                </div>

                {filePreviewUrl && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        Document preview
                      </p>
                    </div>
                    <iframe
                      src={filePreviewUrl}
                      title={data.file.name}
                      className="w-full h-[55vh] border-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="xl:col-span-5 space-y-4">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Your signature
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Type your name or draw a signature.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                      width={520}
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
                      Draw your signature inside the box.
                    </p>
                    <button
                      onClick={clearCanvas}
                      className="inline-flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300 hover:underline"
                    >
                      <Trash2 size={12} /> Clear
                    </button>
                  </div>
                </div>
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Optional note"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />

              <button
                onClick={() => signMutation.mutate()}
                disabled={!signatureReady || signMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 text-sm font-medium disabled:opacity-60"
              >
                <Signature size={15} />
                {signMutation.isPending ? "Submitting..." : "Sign document"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
