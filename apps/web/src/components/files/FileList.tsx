import {
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  Settings,
  Download,
  Trash2,
  Eye,
  Share2,
  History,
  FolderInput,
  Star,
  Tag,
  Pencil,
  ChevronUp,
  ChevronDown,
  Info,
  MessageSquare,
  CheckCircle,
  Hash,
  AlertTriangle,
  GripVertical,
  Lock,
  Unlock,
} from "lucide-react";
import { memo, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import type { CapabilityMap } from "../../hooks/useFileCapabilities";

interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  version?: number;
  uploadedById?: string;
  isStarred?: boolean;
  approvalStatus?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
  approvedBy?: { name: string } | null;
  isLocked?: boolean;
  lockedById?: string | null;
  categoryId?: string | null;
  /** Missing required default folder metadata indicator (FolderIT-style) */
  metaRequiredMissingCount?: number;
}

interface FileListProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onShare?: (file: FileItem) => void;
  onVersions?: (file: FileItem) => void;
  onMove?: (file: FileItem) => void;
  onStar?: (file: FileItem) => void;
  onAssignTag?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  selectedIds?: string[];
  onSelectChange?: (ids: string[]) => void;
  sortBy?: "manual" | "name" | "size" | "createdAt" | "mimeType";
  sortDir?: "asc" | "desc";
  onSort?: (col: "name" | "size" | "createdAt" | "mimeType") => void;
  onDragStart?: (file: FileItem) => void;
  onDragEnd?: () => void;
  onMetadata?: (file: FileItem) => void;
  onComments?: (file: FileItem) => void;
  onSubmitApproval?: (file: FileItem) => void;
  onLock?: (file: FileItem) => void;
  onAssignCategory?: (file: FileItem) => void;
  onApprovalDetail?: (file: FileItem) => void;
  /** Per-file granular capability map from useFileCapabilities hook */
  capabilitiesMap?: CapabilityMap;
  /** @deprecated use capabilitiesMap. Kept for backwards compat */
  canDownload?: boolean;
  /** Toggle list columns (Type/Size/Modified). Name column is always visible. */
  visibleColumns?: {
    type: boolean;
    size: boolean;
    modified: boolean;
    version: boolean;
    approval: boolean;
    retention: boolean;
    lock: boolean;
    metaNotFound: boolean;
  };
  onRetentionClick?: (file: FileItem) => void;
  preserveOrder?: boolean;
  onReorder?: (fromId: string, toId: string) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-green-500" };
  if (mimeType.startsWith("video/"))
    return { icon: Film, color: "text-purple-500" };
  if (mimeType.startsWith("audio/"))
    return { icon: Music, color: "text-pink-500" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500" };
  if (mimeType.includes("zip"))
    return { icon: Archive, color: "text-yellow-500" };
  return { icon: File, color: "text-primary-500" };
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

function SortIcon({
  col,
  sortBy,
  sortDir,
}: {
  col: string;
  sortBy?: string;
  sortDir?: string;
}) {
  if (sortBy !== col)
    return (
      <ChevronUp
        size={11}
        className="text-gray-300 dark:text-gray-600 ml-0.5"
      />
    );
  return sortDir === "asc" ? (
    <ChevronUp size={11} className="text-primary-500 ml-0.5" />
  ) : (
    <ChevronDown size={11} className="text-primary-500 ml-0.5" />
  );
}

// Tooltip wrapper — shows on hover, positions above the badge
function ApprovalTooltip({
  note,
  reviewerName,
  children,
}: {
  note?: string | null;
  reviewerName?: string | null;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const hasContent = note || reviewerName;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && hasContent && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30
                         w-52 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg
                         px-2.5 py-2 shadow-lg pointer-events-none"
        >
          {reviewerName && (
            <span className="block font-medium mb-0.5">by {reviewerName}</span>
          )}
          {note && <span className="block text-gray-300">{note}</span>}
          {/* Arrow */}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 border-4
                           border-transparent border-t-gray-900 dark:border-t-gray-700"
          />
        </span>
      )}
    </span>
  );
}

function FileList({
  files,
  onFileClick,
  onDelete,
  onShare,
  onVersions,
  onMove,
  onStar,
  onAssignTag,
  onRename,
  selectedIds = [],
  onSelectChange,
  sortBy,
  sortDir,
  onSort,
  onDragStart,
  onDragEnd,
  onMetadata,
  onComments,
  onSubmitApproval,
  onLock,
  onAssignCategory,
  onApprovalDetail,
  capabilitiesMap,
  canDownload,
  visibleColumns = {
    type: true,
    size: true,
    modified: true,
    version: false,
    approval: false,
    retention: false,
    lock: true,
    metaNotFound: true,
  },
  onRetentionClick,
  preserveOrder = false,
  onReorder,
}: FileListProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const { user } = useAuthStore();
  const isLockPrivileged = ["ORG_ADMIN", "SUPERADMIN", "MANAGER"].includes(
    user?.role ?? "",
  );

  /**
   * Per-file capability resolver.
   * - Uses the resolved capability map when available.
   * - Falls back to legacy behaviour only for download.
   */
  const fileCan = (fileId: string, cap: string): boolean => {
    if (capabilitiesMap) return capabilitiesMap[fileId]?.[cap] === true;
    // Legacy fallback
    if (cap === "download_files")
      return canDownload !== undefined ? canDownload : false;
    return false;
  };

  const sorted = preserveOrder
    ? [...files]
    : [...files].sort((a, b) => {
        const dir = sortDir === "desc" ? -1 : 1;
        switch (sortBy) {
          case "size":
            return (a.size - b.size) * dir;
          case "mimeType":
            return a.mimeType.localeCompare(b.mimeType) * dir;
          case "createdAt":
            return (
              (new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()) *
              dir
            );
          case "name":
          default:
            return a.name.localeCompare(b.name) * dir;
        }
      });

  if (files.length === 0) return null;

  const handleDownload = async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/${file.id}/download`);
      if (!res.ok) {
        alert("Download not available yet — storage not connected");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    }
  };

  const hasCheckbox = !!onSelectChange;
  const hasStar = !!onStar;
  const checkboxSpan = hasCheckbox ? 1 : 0;
  const starSpan = hasStar ? 1 : 0;
  const versionEnabled = !!visibleColumns.version;
  const approvalEnabled = !!visibleColumns.approval;
  const retentionEnabled = !!visibleColumns.retention;
  const lockEnabled = !!visibleColumns.lock;
  const metaNotFoundEnabled = !!visibleColumns.metaNotFound;
  type DataKey = "type" | "size" | "modified";
  const visibleKeys: DataKey[] = [];
  if (visibleColumns.type) visibleKeys.push("type");
  if (visibleColumns.size) visibleKeys.push("size");
  if (visibleColumns.modified) visibleKeys.push("modified");

  // Pack visible columns to the right side of the 3 "data" slots (Type/Size/Modified).
  // Example: Type-only -> rendered in Modified slot position.
  const dataSlots: Array<DataKey | null> = [null, null, null];
  const start = 3 - visibleKeys.length;
  visibleKeys.forEach((k, i) => {
    dataSlots[start + i] = k;
  });

  // Optional right-side columns (each col-span-2): version, approval, retention, meta.
  // Keep same name width logic and increase total grid tracks based on enabled columns.
  const nameSpan = Math.max(2, 4 - checkboxSpan - starSpan);
  const optionalColUnits =
    (versionEnabled ? 2 : 0) +
    (approvalEnabled ? 2 : 0) +
    (retentionEnabled ? 2 : 0) +
    (lockEnabled ? 2 : 0) +
    (metaNotFoundEnabled ? 2 : 0);
  const totalCols = 12 + optionalColUnits;
  const gridTemplateStyle = {
    gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))`,
  };

  const RETENTION_QUEUE_KEY = "storeit_retention_queue_v1";
  type RetentionJob = {
    id: string;
    scope: "file" | "folder";
    action: string;
    resourceIds: string[];
    applyAt: number | null;
    retention: string;
  };

  const readRetentionJobs = (): RetentionJob[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(RETENTION_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as RetentionJob[];
    } catch {
      return [];
    }
  };

  const retentionByFileId = (() => {
    if (!retentionEnabled) return new Map<string, RetentionJob>();
    const jobs = readRetentionJobs();
    const map = new Map<string, RetentionJob>();

    for (const job of jobs) {
      if (job.scope !== "file") continue;
      for (const fileId of job.resourceIds ?? []) {
        const existing = map.get(fileId);
        if (!existing) {
          map.set(fileId, job);
          continue;
        }

        // Infinite wins over finite.
        if (existing.applyAt === null) continue;
        if (job.applyAt === null) {
          map.set(fileId, job);
          continue;
        }

        // Otherwise choose the nearest applyAt.
        if (
          typeof existing.applyAt === "number" &&
          typeof job.applyAt === "number" &&
          job.applyAt < existing.applyAt
        ) {
          map.set(fileId, job);
        }
      }
    }

    return map;
  })();

  const formatRetention = (job?: RetentionJob) => {
    if (!job) return null;
    if (job.applyAt === null) return "Infinite";
    const dt = new Date(job.applyAt);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-visible">
      {/* Header */}
      <div
        className="grid gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5 items-center"
        style={gridTemplateStyle}
      >
        {hasCheckbox && (
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={files.length > 0 && selectedIds.length === files.length}
              onChange={(e) =>
                onSelectChange!(e.target.checked ? sorted.map((f) => f.id) : [])
              }
              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
            />
          </div>
        )}
        <div
          className={`col-span-${nameSpan} text-xs font-medium text-gray-500`}
        >
          {onSort ? (
            <button
              onClick={() => onSort("name")}
              className="flex items-center hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Name <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} />
            </button>
          ) : (
            "Name"
          )}
        </div>
        {hasStar && (
          <div className="col-span-1 flex items-center justify-center">
            <Star size={11} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {/* Data slots: pack visible columns to the right */}
        {dataSlots.map((slot, idx) => (
          <div
            key={idx}
            className="col-span-2 text-xs font-medium text-gray-500"
          >
            {slot === "type" && (
              <>
                {onSort ? (
                  <button
                    onClick={() => onSort("mimeType")}
                    className="flex items-center hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Type{" "}
                    <SortIcon
                      col="mimeType"
                      sortBy={sortBy}
                      sortDir={sortDir}
                    />
                  </button>
                ) : (
                  "Type"
                )}
              </>
            )}
            {slot === "size" && (
              <>
                {onSort ? (
                  <button
                    onClick={() => onSort("size")}
                    className="flex items-center hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Size{" "}
                    <SortIcon col="size" sortBy={sortBy} sortDir={sortDir} />
                  </button>
                ) : (
                  "Size"
                )}
              </>
            )}
            {slot === "modified" && (
              <>
                {onSort ? (
                  <button
                    onClick={() => onSort("createdAt")}
                    className="flex items-center hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Modified{" "}
                    <SortIcon
                      col="createdAt"
                      sortBy={sortBy}
                      sortDir={sortDir}
                    />
                  </button>
                ) : (
                  "Modified"
                )}
              </>
            )}
            {!slot && <span className="opacity-0">—</span>}
          </div>
        ))}
        {versionEnabled && (
          <div className="col-span-2 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
            Version
          </div>
        )}
        {approvalEnabled && (
          <div className="col-span-2 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
            Approval
          </div>
        )}
        {retentionEnabled && (
          <div className="col-span-2 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
            Retention
          </div>
        )}
        {lockEnabled && (
          <div className="col-span-2 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
            Lock
          </div>
        )}
        {metaNotFoundEnabled && (
          <div className="col-span-2 text-xs font-medium text-gray-500 text-center whitespace-nowrap">
            Meta not found
          </div>
        )}
        {/* Actions header placeholder */}
        <div className="col-span-1" />
      </div>

      {/* Rows */}
      {sorted.map((file) => {
        const { icon: Icon, color } = getFileIcon(file.mimeType);
        const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

        return (
          <div
            key={file.id}
            className={`relative group grid gap-3 px-4 py-3 border-b
                       border-gray-100 dark:border-gray-800 last:border-b-0
                       hover:bg-gray-50 dark:hover:bg-white/5 transition-colors items-center`}
            style={gridTemplateStyle}
            draggable={!!onDragStart}
            onDragStart={() => onDragStart?.(file)}
            onDragEnd={() => onDragEnd?.()}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              const fromId = e.dataTransfer.getData(
                "text/storeit-file-order-id",
              );
              onReorder(fromId, file.id);
            }}
          >
            {/* Checkbox */}
            {hasCheckbox && (
              <div
                className="col-span-1 flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(file.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selectedIds, file.id]
                      : selectedIds.filter((id) => id !== file.id);
                    onSelectChange!(next);
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-primary-500 cursor-pointer"
                />
              </div>
            )}

            {/* Name + badges */}
            <button
              onClick={() => onFileClick(file)}
              className={`col-span-${nameSpan} flex flex-col justify-center text-left min-w-0`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {onReorder && (
                  <span
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "text/storeit-file-order-id",
                        file.id,
                      )
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} />
                  </span>
                )}
                <Icon size={16} className={color} />
                <span className="flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-100 truncate hover:text-primary-500 dark:hover:text-pink-400 transition-colors font-medium">
                  {file.name}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {!lockEnabled && file.isLocked && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    🔒 Locked
                  </span>
                )}
              </div>
            </button>

            {/* Star column */}
            {hasStar && (
              <div
                className="col-span-1 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onStar!(file)}
                  className="p-1 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={file.isStarred ? "Unstar" : "Star"}
                >
                  <Star
                    size={14}
                    className={
                      file.isStarred
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    }
                  />
                </button>
              </div>
            )}

            {/* Data slots: pack visible columns to the right */}
            {dataSlots.map((slot, idx) => (
              <div key={idx} className="col-span-2">
                {slot === "type" && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                    {ext}
                  </span>
                )}
                {slot === "size" && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatBytes(file.size)}
                  </span>
                )}
                {slot === "modified" && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(file.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            ))}

            {versionEnabled && (
              <div className="col-span-2 flex items-center justify-center">
                <span className="text-xs bg-pink-100 dark:bg-pink-900/40 text-primary-500 dark:text-pink-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                  v{Math.max(1, file.version ?? 1)}
                </span>
              </div>
            )}

            {approvalEnabled && (
              <div className="col-span-2 flex items-center justify-center">
                {file.approvalStatus && file.approvalStatus !== "draft" ? (
                  <ApprovalTooltip
                    note={file.approvalNote}
                    reviewerName={file.approvedBy?.name}
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprovalDetail?.(file);
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer inline-flex items-center whitespace-nowrap
                                  transition-opacity hover:opacity-80 ${
                                    file.approvalStatus === "approved"
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                                      : file.approvalStatus === "rejected"
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
                                  }`}
                    >
                      {file.approvalStatus === "approved"
                        ? "✓ Approved"
                        : file.approvalStatus === "rejected"
                          ? "✗ Rejected"
                          : "⏳ Pending"}
                    </span>
                  </ApprovalTooltip>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    —
                  </span>
                )}
              </div>
            )}

            {retentionEnabled && (
              <div className="col-span-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetentionClick?.(file);
                  }}
                  className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-primary-500 dark:hover:text-pink-300 transition-colors cursor-pointer max-w-full"
                  title="View retention details"
                >
                  {formatRetention(retentionByFileId.get(file.id)) ?? "—"}
                </button>
              </div>
            )}

            {lockEnabled && (
              <div className="col-span-2 flex items-center justify-center">
                {file.isLocked ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap
                               bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60"
                    title="File is locked for editing"
                  >
                    <Lock size={11} className="shrink-0" />
                    Locked
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap
                               bg-gray-50 text-gray-600 dark:bg-gray-800/80 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                    title="File is not locked"
                  >
                    <Unlock size={11} className="shrink-0" />
                    Unlocked
                  </span>
                )}
              </div>
            )}

            {metaNotFoundEnabled && (
              <div className="col-span-2 flex items-center justify-center">
                {!!file.metaRequiredMissingCount &&
                file.metaRequiredMissingCount > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fileCan(file.id, "edit_metadata")) onMetadata?.(file);
                    }}
                    className="inline-flex w-full max-w-full items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap
                               bg-white dark:bg-gray-800 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800/70
                               hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20
                               overflow-hidden"
                    title="Missing required metadata values"
                  >
                    <AlertTriangle size={12} className="shrink-0" />
                    <span className="truncate whitespace-nowrap">
                      Missing required meta ({file.metaRequiredMissingCount})
                    </span>
                  </button>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    —
                  </span>
                )}
              </div>
            )}

            {/* Always-reserved far-right actions column */}
            <div className="col-span-1 flex items-center justify-end">
              <div className="relative flex items-center gap-0.5 mr-0">
                {fileCan(file.id, "share_files") && onShare && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare(file);
                    }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100
                             hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity text-gray-400 dark:text-gray-500"
                    title="Permissions"
                  >
                    <Share2 size={14} />
                  </button>
                )}
                {fileCan(file.id, "download_files") && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleDownload(file);
                      setActiveMenu(null);
                    }}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100
                             hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity text-gray-400 dark:text-gray-500"
                    title="Download"
                  >
                    <Download size={14} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenu(activeMenu === file.id ? null : file.id);
                  }}
                  className="p-1 rounded-lg opacity-0 group-hover:opacity-100
                             hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity text-gray-400 dark:text-gray-500"
                  title="More actions"
                >
                  <Settings size={14} />
                </button>

                {activeMenu === file.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setActiveMenu(null)}
                    />
                    <div className="absolute right-0 top-full mb-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 p-1">
                      <button
                        onClick={() => {
                          onFileClick(file);
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <Eye size={14} /> Preview
                      </button>
                      {fileCan(file.id, "edit_file_attrs") && onRename && (
                        <button
                          onClick={() => {
                            onRename(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <Pencil size={14} /> Rename
                        </button>
                      )}
                      {/* Permissions + Download moved to dedicated row icons */}
                      {onComments && (
                        <button
                          onClick={() => {
                            onComments(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <MessageSquare size={14} /> Comments
                        </button>
                      )}
                      {onVersions && (
                        <button
                          onClick={() => {
                            onVersions(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <History size={14} /> Version History
                        </button>
                      )}
                      {fileCan(file.id, "move_files") && onMove && (
                        <button
                          onClick={() => {
                            onMove(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <FolderInput size={14} /> Move to folder
                        </button>
                      )}
                      {fileCan(file.id, "edit_file_attrs") &&
                        onSubmitApproval &&
                        file.approvalStatus !== "in_review" && (
                          <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                            <button
                              onClick={() => {
                                onSubmitApproval(file);
                                setActiveMenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                            >
                              <CheckCircle size={14} /> Start workflow
                            </button>
                          </div>
                        )}
                      {/* Lock/Unlock is strictly for MANAGER+ or file owner (handled separately by backend, but hidden here to avoid confusion for EDITORs who don't own it) */}
                      {(isLockPrivileged || file.uploadedById === user?.id) &&
                        onLock && (
                          <button
                            onClick={() => {
                              onLock(file);
                              setActiveMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            {file.isLocked ? "🔓 Unlock" : "🔒 Lock"}
                          </button>
                        )}
                      {fileCan(file.id, "edit_file_attrs") && onAssignTag && (
                        <button
                          onClick={() => {
                            onAssignTag(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <Tag size={14} /> Assign tag
                        </button>
                      )}
                      {fileCan(file.id, "edit_file_attrs") &&
                        onAssignCategory && (
                          <button
                            onClick={() => {
                              onAssignCategory(file);
                              setActiveMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                          >
                            <Hash size={14} /> Assign category
                          </button>
                        )}
                      {fileCan(file.id, "edit_metadata") && onMetadata && (
                        <button
                          onClick={() => {
                            onMetadata(file);
                            setActiveMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <Info size={14} /> Metadata
                        </button>
                      )}
                      {fileCan(file.id, "delete_files") && (
                        <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                          <button
                            onClick={() => {
                              onDelete(file);
                              setActiveMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(FileList);
