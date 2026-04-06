import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Download,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  ExternalLink,
  PenTool,
} from "lucide-react";
import type { AxiosError } from "axios";
import api from "../../api/axios";
import { getAuditActionLabel } from "../../utils/auditAction";
import { canPreviewImageMimeType, getFileKind } from "../../utils/fileMime";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  storageKey?: string;
  viewUrl?: string | null;

  // Optional extra fields (available from file list / server queries).
  version?: number;
  isLocked?: boolean;
  lockedById?: string | null;
  approvalStatus?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
  approvedBy?: { name: string } | null;
  signatureStatus?: string | null;
  signatureNote?: string | null;
  signedAt?: string | null;
  signedBy?: { name: string } | null;
  activeSignatureWorkflowId?: string | null;
  currentSignatureStepOrder?: number | null;
  tags?: { tag: { id: string; name: string; color: string } }[];
}

interface FilePreviewModalProps {
  file: FileItem | null;
  onClose: () => void;
}

type FileMetadataRow = {
  id: string;
  key: string;
  value: string;
};

type AuditLogEntry = {
  id: string;
  action: string;
  createdAt: string;
  user?: { name?: string; email?: string } | null;
};

type SignatureStepRow = {
  id: string;
  stepOrder: number;
  status: string;
  signatureName?: string | null;
  signatureMethod?: string | null;
  signatureData?: Record<string, unknown> | null;
  actedAt?: string | null;
  signerUser?: { name?: string | null; email?: string | null } | null;
  signerName?: string | null;
  signerEmail?: string | null;
};

type SigningWorkflowEnvelope = {
  file: FileItem;
  workflow: {
    id: string;
    status: string;
    steps: SignatureStepRow[];
  } | null;
};

function getAxiosStatus(err: unknown): number | undefined {
  return (err as AxiosError | undefined)?.response?.status;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileType = (mimeType: string) => {
  return getFileKind(mimeType);
};

const getOfficeViewerUrl = (fileUrl: string) => {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
};

const getFileIcon = (mimeType: string) => {
  const type = getFileType(mimeType);
  switch (type) {
    case "image":
      return {
        icon: Image,
        color: "text-green-500",
        bg: "bg-green-50 dark:bg-green-900/30",
      };
    case "video":
      return {
        icon: Film,
        color: "text-purple-500",
        bg: "bg-purple-50 dark:bg-purple-900/30",
      };
    case "audio":
      return {
        icon: Music,
        color: "text-pink-500",
        bg: "bg-pink-50 dark:bg-pink-900/30",
      };
    case "pdf":
      return {
        icon: FileText,
        color: "text-red-500",
        bg: "bg-red-50 dark:bg-red-900/30",
      };
    case "office":
      return {
        icon: FileText,
        color: "text-primary-500",
        bg: "bg-primary-50 dark:bg-primary-900/30",
      };
    case "archive":
      return {
        icon: Archive,
        color: "text-yellow-500",
        bg: "bg-yellow-50 dark:bg-yellow-900/30",
      };
    case "text":
      return {
        icon: FileText,
        color: "text-gray-500",
        bg: "bg-gray-50 dark:bg-gray-800",
      };
    default:
      return {
        icon: File,
        color: "text-gray-500",
        bg: "bg-gray-50 dark:bg-gray-800",
      };
  }
};

function FilePreviewModalInner({
  file,
  onClose,
}: {
  file: FileItem;
  onClose: () => void;
}) {
  const fileType = getFileType(file.mimeType);
  const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
  const [viewUrl, setViewUrl] = useState<string | null>(file.viewUrl ?? null);
  const [showInlinePreview, setShowInlinePreview] = useState(false);

  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: ["audit-file", file.id],
    queryFn: async () => {
      const res = await api.get(`/audit/file/${file.id}`);
      return res.data as { logs: AuditLogEntry[] };
    },
  });

  const auditLogs = auditData?.logs ?? [];

  const {
    data: metadataData,
    isLoading: metadataLoading,
    error: metadataError,
  } = useQuery({
    queryKey: ["file-metadata-preview", file.id],
    queryFn: async () => {
      const res = await api.get(`/files/${file.id}/metadata`);
      return res.data as { metadata: FileMetadataRow[] };
    },
  });

  const metadataRows = metadataData?.metadata ?? [];
  const hasSignatureDetails =
    (!!file.signatureStatus && file.signatureStatus !== "draft") ||
    !!file.signedAt ||
    !!file.signedBy?.name ||
    !!file.signatureNote;
  const { data: signingData, isLoading: signingLoading } = useQuery({
    queryKey: ["signing-file-preview", file.id],
    enabled: hasSignatureDetails,
    queryFn: async () => {
      const res = await api.get(`/signing/files/${file.id}`);
      return res.data as SigningWorkflowEnvelope;
    },
  });
  const signingWorkflow = signingData?.workflow ?? null;
  const metadataStatus = getAxiosStatus(metadataError);
  const metadataDenied =
    metadataStatus === 403 || metadataStatus === 401;
  const signatureSteps = signingWorkflow?.steps ?? [];
  const latestSignedStep =
    [...signatureSteps]
      .reverse()
      .find(
        (step) =>
          step.status === "signed" &&
          step.signatureData &&
          typeof step.signatureData === "object",
      ) ?? null;
  const signatureData = latestSignedStep?.signatureData ?? null;
  const signatureImageUrl =
    signatureData && typeof signatureData.dataUrl === "string"
      ? signatureData.dataUrl
      : null;
  const signatureText =
    signatureData && typeof signatureData.typedName === "string"
      ? signatureData.typedName
      : latestSignedStep?.signatureName ?? file.signedBy?.name ?? null;

  const formatDetailedDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/files/${file.id}`)
      .then((res) => {
        if (!cancelled) setViewUrl(res.data.file.viewUrl);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  const renderPreview = () => {
    // No URL yet (S3 not connected) — show placeholder
    if (!viewUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
          <div
            className={`w-20 h-20 ${bg} rounded-2xl flex items-center justify-center mb-4`}
          >
            <Icon size={36} className={color} />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-100 mb-1">
            {file.name}
          </p>
          <p className="text-xs text-gray-400 mb-6">{formatBytes(file.size)}</p>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 max-w-sm">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">
              Preview not available yet
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              File preview will work once S3/R2 storage is connected. The file
              metadata has been saved successfully.
            </p>
          </div>
        </div>
      );
    }

    // IMAGE
    if (fileType === "image") {
      if (!canPreviewImageMimeType(file.mimeType)) {
        return (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <div
              className={`w-20 h-20 ${bg} rounded-2xl flex items-center justify-center mb-4`}
            >
              <Icon size={36} className={color} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-100 mb-1">
              {file.name}
            </p>
            <p className="text-xs text-gray-400 mb-6">{formatBytes(file.size)}</p>
            <p className="text-xs text-gray-500 mb-4">
              This image format is not previewable in the browser. Download the
              file to view it.
            </p>
            <a
              href={viewUrl}
              download={file.name}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white
                         text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Download size={15} />
              Download file
            </a>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center h-full p-4">
          <img
            src={viewUrl}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      );
    }

    // VIDEO
    if (fileType === "video") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <video
            src={viewUrl}
            controls
            className="max-w-full max-h-full rounded-lg"
            style={{ maxHeight: "70vh" }}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // AUDIO
    if (fileType === "audio") {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
          <div
            className={`w-24 h-24 ${bg} rounded-2xl flex items-center justify-center`}
          >
            <Icon size={40} className={color} />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-100">
            {file.name}
          </p>
          <audio src={viewUrl} controls className="w-full max-w-md">
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    // PDF — browser built-in viewer
    if (fileType === "pdf") {
      return (
        <iframe
          src={`${viewUrl}#toolbar=1&navpanes=1`}
          className="w-full h-full border-0 rounded-b-xl"
          title={file.name}
        />
      );
    }

    // OFFICE DOCS — Microsoft Office Online viewer
    if (fileType === "office") {
      return (
        <div className="flex flex-col h-full">
          <iframe
            src={getOfficeViewerUrl(viewUrl)}
            className="w-full flex-1 border-0"
            title={file.name}
          />
          <div className="p-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-xs text-gray-400">
              Powered by Microsoft Office Online
            </p>
          </div>
        </div>
      );
    }

    // TEXT files
    if (fileType === "text") {
      return (
        <iframe
          src={viewUrl}
          className="w-full h-full border-0 rounded-b-xl bg-white dark:bg-gray-900"
          title={file.name}
        />
      );
    }

    // FALLBACK — can't preview, offer download
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center">
        <div
          className={`w-20 h-20 ${bg} rounded-2xl flex items-center justify-center mb-4`}
        >
          <Icon size={36} className={color} />
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-100 mb-1">
          {file.name}
        </p>
        <p className="text-xs text-gray-400 mb-6">{formatBytes(file.size)}</p>
        <p className="text-xs text-gray-500 mb-4">
          This file type cannot be previewed in the browser.
        </p>
        <a
          href={viewUrl}
          download={file.name}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white
                     text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Download size={15} />
          Download file
        </a>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex flex-col
                      bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800
                        bg-white dark:bg-gray-900 shrink-0"
        >
          {/* File icon */}
          <div
            className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center shrink-0`}
          >
            <Icon size={16} className={color} />
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-400">
              {formatBytes(file.size)} · {file.mimeType} ·{" "}
              {new Date(file.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {viewUrl && (
              <>
                <a
                  href={viewUrl}
                  download={file.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg
                             hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Download size={13} />
                  Download
                </a>
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                             text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg
                             hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <ExternalLink size={13} />
                  Open
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800
                         rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Detail-first content */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="px-4 pt-4">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  File details
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Click preview/open to view the document
                </p>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
                <button
                  onClick={() => setShowInlinePreview(true)}
                  className="lg:col-span-3 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-left hover:border-primary-400 dark:hover:border-primary-500 transition-colors bg-gray-50 dark:bg-gray-800/40"
                >
                  {fileType === "image" && viewUrl ? (
                    <img
                      src={viewUrl}
                      alt={file.name}
                      className="w-full h-28 object-contain rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700"
                    />
                  ) : (
                    <div
                      className={`w-full h-28 rounded-lg border border-gray-100 dark:border-gray-700 flex items-center justify-center ${bg}`}
                    >
                      <Icon size={30} className={color} />
                    </div>
                  )}
                  <p className="text-xs text-primary-600 dark:text-primary-400 mt-2 font-medium">
                    Open preview
                  </p>
                </button>

                <div className="lg:col-span-9 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div className="text-gray-500 dark:text-gray-400">Name</div>
                  <div className="text-gray-900 dark:text-white wrap-break-word">
                    {file.name}
                  </div>

                  <div className="text-gray-500 dark:text-gray-400">Type</div>
                  <div className="text-gray-900 dark:text-white">
                    {file.mimeType}
                  </div>

                  <div className="text-gray-500 dark:text-gray-400">Size</div>
                  <div className="text-gray-900 dark:text-white">
                    {formatBytes(file.size)}
                  </div>

                  <div className="text-gray-500 dark:text-gray-400">
                    Created
                  </div>
                  <div className="text-gray-900 dark:text-white">
                    {formatDetailedDateTime(file.createdAt)}
                  </div>

                  <div className="text-gray-500 dark:text-gray-400">
                    Version
                  </div>
                  <div className="text-gray-900 dark:text-white">
                    {file.version ? `v${file.version}` : "—"}
                  </div>

                  <div className="text-gray-500 dark:text-gray-400">Lock</div>
                  <div className="text-gray-900 dark:text-white">
                    {file.isLocked ? "Locked" : "Not locked"}
                  </div>
                </div>
              </div>

              {showInlinePreview && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  <div className="px-4 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      Document preview
                    </p>
                    <button
                      onClick={() => setShowInlinePreview(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Hide
                    </button>
                  </div>
                  <div className="h-[58vh]">{renderPreview()}</div>
                </div>
              )}
            </div>
          </div>

          {(file.signatureStatus && file.signatureStatus !== "draft") ||
          file.signedAt ||
          file.signedBy?.name ||
          file.signatureNote ? (
            <div className="px-4 pt-4">
              <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/60 dark:bg-cyan-900/15 overflow-hidden">
                <div className="px-4 py-3 border-b border-cyan-100 dark:border-cyan-900/40">
                  <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">
                    Signature details
                  </p>
                  <p className="text-xs text-cyan-700/80 dark:text-cyan-200/80 mt-0.5">
                    Signed workflow information for this file
                  </p>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-cyan-700 dark:text-cyan-200 font-medium mb-1">
                      Status
                    </p>
                    <p className="text-cyan-950 dark:text-cyan-50">
                      {file.signatureStatus === "in_progress"
                        ? "In progress"
                        : file.signatureStatus === "signed"
                          ? "Signed"
                          : file.signatureStatus === "cancelled"
                            ? "Cancelled"
                            : file.signatureStatus ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-cyan-700 dark:text-cyan-200 font-medium mb-1">
                      Completed
                    </p>
                    <p className="text-cyan-950 dark:text-cyan-50">
                      {file.signedAt
                        ? formatDetailedDateTime(file.signedAt)
                        : "Not completed yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-cyan-700 dark:text-cyan-200 font-medium mb-1">
                      Signed by
                    </p>
                    <p className="text-cyan-950 dark:text-cyan-50">
                      {file.signedBy?.name ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-cyan-700 dark:text-cyan-200 font-medium mb-1">
                      Note
                    </p>
                    <p className="text-cyan-950 dark:text-cyan-50 whitespace-pre-wrap">
                      {file.signatureNote ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {hasSignatureDetails ? (
            <div className="px-4 pt-4">
              <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/60 dark:bg-cyan-900/15 overflow-hidden">
                <div className="px-4 py-3 border-b border-cyan-100 dark:border-cyan-900/40 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-cyan-900 dark:text-cyan-100 inline-flex items-center gap-2">
                      <PenTool size={14} /> Signature preview
                    </p>
                    <p className="text-xs text-cyan-700/80 dark:text-cyan-200/80 mt-0.5">
                      The signature captured when this workflow was completed
                    </p>
                  </div>
                  {signatureImageUrl && (
                    <a
                      href={signatureImageUrl}
                      download={`${file.name}-signature.png`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 dark:border-cyan-900/50 bg-white/80 dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-cyan-900 dark:text-cyan-100 hover:bg-white dark:hover:bg-gray-800"
                    >
                      <Download size={13} />
                      Download signature
                    </a>
                  )}
                </div>
                <div className="px-4 py-4">
                  {signingLoading ? (
                    <div className="rounded-lg border border-dashed border-cyan-200 dark:border-cyan-800 px-4 py-6 text-sm text-cyan-700 dark:text-cyan-200">
                      Loading signature preview...
                    </div>
                  ) : signatureImageUrl ? (
                    <img
                      src={signatureImageUrl}
                      alt="Signed signature"
                      className="max-h-48 w-full object-contain rounded-lg bg-white dark:bg-gray-950 border border-cyan-100 dark:border-cyan-800"
                    />
                  ) : signatureText ? (
                    <div className="rounded-lg border border-cyan-100 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/30 px-4 py-5">
                      <p className="text-2xl italic font-semibold text-cyan-950 dark:text-cyan-50">
                        {signatureText}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-cyan-200 dark:border-cyan-800 px-4 py-6 text-sm text-cyan-700 dark:text-cyan-200">
                      No stored signature image is available for this file.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Document details + audit log */}
          <div className="px-4 pb-5 pt-4">
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Metadata
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Metadata values available for this document
                </p>
              </div>
              <div className="px-4 py-3">
                {metadataLoading ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Loading metadata...
                  </div>
                ) : metadataDenied ? (
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    You have preview access, but not metadata view permission.
                  </div>
                ) : metadataError ? (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    Failed to load metadata.
                  </div>
                ) : metadataRows.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No metadata assigned.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {metadataRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-12 gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
                      >
                        <div className="col-span-4 text-xs font-medium text-gray-700 dark:text-gray-200 wrap-break-word">
                          {row.key}
                        </div>
                        <div className="col-span-8 text-xs text-gray-900 dark:text-white wrap-break-word">
                          {row.value || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Audit log
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Activity events for this document
                </p>
              </div>

              <div className="px-4 py-3">
                {auditLoading ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Loading audit log...
                  </div>
                ) : auditError ? (
                  <div className="text-sm text-red-600 dark:text-red-400">
                    Failed to load audit log.
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No audit events yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start justify-between gap-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {getAuditActionLabel(log.action)}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatDetailedDateTime(log.createdAt)}
                          </p>
                        </div>
                        <div className="text-right min-w-[140px]">
                          <p className="text-xs text-gray-900 dark:text-white">
                            {log.user?.name ?? "System"}
                          </p>
                          {log.user?.email && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {log.user.email}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function FilePreviewModal({
  file,
  onClose,
}: FilePreviewModalProps) {
  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, file]);

  useEffect(() => {
    if (!file) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [file]);

  if (!file) return null;

  return <FilePreviewModalInner key={file.id} file={file} onClose={onClose} />;
}
