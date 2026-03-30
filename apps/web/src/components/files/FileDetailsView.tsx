import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  Image,
  Film,
  Music,
  File,
  Eye,
  Lock,
  Upload,
  Workflow,
  Bell,
  Share2,
  ShieldCheck,
} from "lucide-react";
import api from "../../api/axios";
import { getAuditActionLabel } from "../../utils/auditAction";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  version?: number;
  isLocked?: boolean;
  viewUrl?: string | null;
  approvalStatus?: string | null;
}

interface Props {
  file: FileItem | null;
  onBack: () => void;
  onOpenPreview: (file: FileItem) => void;
  breadcrumbItems?: Array<{ id: string; label: string; clickable?: boolean }>;
  onBreadcrumbClick?: (item: {
    id: string;
    label: string;
    clickable?: boolean;
  }) => void;
  retentionLabel?: string;
  onOpenRetention?: (file: FileItem) => void;
  onToggleLock?: (file: FileItem) => void;
  onUploadNewVersion?: (file: FileItem) => void;
  onOpenVersionHistory?: (file: FileItem) => void;
  onOpenWorkflow?: (file: FileItem) => void;
  canViewMetadata?: boolean;
  isLocking?: boolean;
  isUploadingVersion?: boolean;
  workflowButtonLabel?: string;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

type AuditLogEntry = {
  id: string;
  action: string;
  createdAt: string;
  user?: { name?: string | null } | null;
};

function FileTypeGlyph({
  mimeType,
  size,
  className,
}: {
  mimeType: string;
  size: number;
  className?: string;
}) {
  if (mimeType.startsWith("image/"))
    return <Image size={size} className={className} />;
  if (mimeType.startsWith("video/"))
    return <Film size={size} className={className} />;
  if (mimeType.startsWith("audio/"))
    return <Music size={size} className={className} />;
  if (mimeType.includes("pdf"))
    return <FileText size={size} className={className} />;
  return <File size={size} className={className} />;
}

export default function FileDetailsView({
  file,
  onBack,
  onOpenPreview,
  breadcrumbItems = [],
  onBreadcrumbClick,
  retentionLabel = "Infinite",
  onOpenRetention,
  onToggleLock,
  onUploadNewVersion,
  onOpenVersionHistory,
  onOpenWorkflow,
  canViewMetadata = true,
  isLocking = false,
  isUploadingVersion = false,
  workflowButtonLabel = "Start approval workflow",
}: Props) {
  const { data: metadataData, isLoading: metadataLoading } = useQuery({
    queryKey: ["file-metadata-preview-inline", file?.id],
    enabled: !!file?.id && canViewMetadata,
    queryFn: async () => {
      const res = await api.get(`/files/${file!.id}/metadata`);
      return res.data as {
        metadata: Array<{ id: string; key: string; value: string }>;
      };
    },
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-file-inline", file?.id],
    enabled: !!file?.id,
    queryFn: async () => {
      const res = await api.get(`/audit/file/${file!.id}`);
      return res.data as { logs: AuditLogEntry[] };
    },
  });

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ["file-versions-inline", file?.id],
    enabled: !!file?.id,
    queryFn: async () => {
      const res = await api.get(`/files/${file!.id}/versions`);
      return res.data as {
        versions: Array<{
          id: string;
          version: number;
          createdAt: string;
          isCurrent?: boolean;
          uploadedBy?: { name?: string | null } | null;
        }>;
      };
    },
  });

  if (!file) return null;
  const metadataRows = metadataData?.metadata ?? [];
  const auditLogs = auditData?.logs ?? [];
  const topMeta = metadataRows.slice(0, 8);
  const versions = versionsData?.versions ?? [];
  const previousVersions = versions.filter((v) => !v.isCurrent).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <ArrowLeft size={13} />
          Back
        </button>
        <span>{">"}</span>
        {breadcrumbItems.length > 0 ? (
          breadcrumbItems.map((item, idx) => (
            <span
              key={`${item.id}-${idx}`}
              className="inline-flex items-center gap-2"
            >
              {idx > 0 && <span>{">"}</span>}
              <button
                onClick={() => item.clickable && onBreadcrumbClick?.(item)}
                className={
                  idx === breadcrumbItems.length - 1
                    ? "truncate max-w-[260px] text-gray-700 dark:text-gray-200"
                    : item.clickable
                      ? "truncate max-w-[180px] hover:underline text-primary-600 dark:text-primary-400"
                      : "truncate max-w-[180px]"
                }
                disabled={!item.clickable}
              >
                {item.label}
              </button>
            </span>
          ))
        ) : (
          <>
            <span>Projects</span>
            <span>{">"}</span>
            <span className="truncate text-gray-700 dark:text-gray-200">
              {file.name}
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-9 space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 p-4">
            <div className="flex items-start gap-3 mb-3">
              <button
                onClick={() => onOpenPreview(file)}
                className="w-14 h-16 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800/80 hover:border-primary-400 dark:hover:border-primary-500 transition-colors shrink-0"
                title="Open document preview"
              >
                <FileTypeGlyph
                  mimeType={file.mimeType}
                  size={24}
                  className="text-primary-500"
                />
              </button>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-primary-600 dark:text-gray-100 truncate">
                  {file.name}
                </p>
                <button
                  onClick={() => onOpenPreview(file)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:underline"
                >
                  <Eye size={13} /> Open preview
                </button>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50/60 dark:bg-gray-800/70">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Metadata
              </p>
              {!canViewMetadata ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  You do not have permission to view metadata for this file.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs">
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
                      Notes
                    </p>
                    <p className="text-gray-700 dark:text-gray-200">
                      {metadataRows.find((m) => m.key.toLowerCase() === "notes")
                        ?.value || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
                      Type
                    </p>
                    <p className="text-gray-700 dark:text-gray-200">
                      {file.mimeType}
                    </p>
                  </div>
                  {topMeta.map((row) => (
                    <div key={row.id}>
                      <p className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
                        {row.key}
                      </p>
                      <p className="text-gray-700 dark:text-gray-200 wrap-break-word">
                        {row.value || "—"}
                      </p>
                    </div>
                  ))}
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
                      Size
                    </p>
                    <p className="text-gray-700 dark:text-gray-200">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-blue-600 dark:text-blue-400 font-semibold mb-1">
                      Created
                    </p>
                    <p className="text-gray-700 dark:text-gray-200">
                      {new Date(file.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {canViewMetadata && metadataLoading && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 px-4 py-3 text-sm text-gray-500 dark:text-gray-300">
              Loading metadata...
            </div>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Version History
              </p>
              <button
                onClick={() => onOpenVersionHistory?.(file)}
                className="text-xs text-gray-600 dark:text-gray-300 hover:underline"
              >
                View all versions
              </button>
            </div>
            <div className="px-4 py-3 space-y-2">
              {versionsLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Loading versions...
                </p>
              ) : (
                <>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Current version:{" "}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      v{file.version ?? 1}
                    </span>
                  </p>
                  {previousVersions.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No previous versions yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {previousVersions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5"
                        >
                          <p className="text-xs text-gray-700 dark:text-gray-200 truncate">
                            v{v.version} ·{" "}
                            {new Date(v.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {v.uploadedBy?.name ? ` · ${v.uploadedBy.name}` : ""}
                          </p>
                          <button
                            onClick={() => onOpenVersionHistory?.(file)}
                            className="shrink-0 text-[11px] text-gray-600 dark:text-gray-300 hover:underline"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Audit Log
              </p>
            </div>
            <div className="px-4 py-3">
              {auditLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Loading audit log...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No audit events yet.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between gap-3 rounded-md bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5 min-h-[34px]"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-900 dark:text-white truncate leading-tight">
                          {getAuditActionLabel(log.action)}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                          {new Date(log.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-[11px] text-gray-900 dark:text-white leading-tight">
                          {log.user?.name ?? "System"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 space-y-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 p-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 inline-flex items-center gap-1">
              <Bell size={14} /> Reminders
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              No reminders
            </p>
            <button className="mt-2 text-xs text-gray-600 dark:text-gray-300 hover:underline">
              + Add new reminder
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/90 p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 inline-flex items-center gap-1">
                <Share2 size={14} /> Shared to
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Edit from permissions
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 mr-2 inline-flex items-center gap-1">
                <ShieldCheck size={14} /> Retention
              </p>
              <button
                onClick={() => onOpenRetention?.(file)}
                className="mt-2 text-xs text-gray-700 dark:text-gray-300 hover:underline"
              >
                {retentionLabel}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => onToggleLock?.(file)}
              disabled={isLocking}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-primary-600 text-white hover:bg-primary-500 dark:bg-primary-600 dark:hover:bg-primary-400 disabled:opacity-60"
            >
              <Lock size={13} /> {file.isLocked ? "Unlock file" : "Lock file"}
            </button>
            <button
              onClick={() => onUploadNewVersion?.(file)}
              disabled={isUploadingVersion}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-primary-600 text-white hover:bg-primary-500 dark:bg-primary-600 dark:hover:bg-primary-400 disabled:opacity-60"
            >
              <Upload size={13} />{" "}
              {isUploadingVersion ? "Uploading..." : "Upload new version"}
            </button>
            <button
              onClick={() => onOpenWorkflow?.(file)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-primary-600 text-white hover:bg-primary-500 dark:bg-primary-600 dark:hover:bg-primary-400"
            >
              <Workflow size={13} /> {workflowButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
