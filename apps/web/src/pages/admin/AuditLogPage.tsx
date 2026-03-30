import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Upload,
  Trash2,
  Eye,
  FolderPlus,
  Shield,
  Link,
  LogIn,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader,
  User,
  Download,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { getAuditActionLabel } from "../../utils/auditAction";

const ACTION_CONFIG: Record<
  string,
  {
    label: string;
    icon: LucideIcon;
    color: string;
    bg: string;
  }
> = {
  "file.upload": {
    label: "File uploaded",
    icon: Upload,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  "file.upload.version": {
    label: "New version uploaded",
    icon: Upload,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
  },
  "file.delete": {
    label: "File deleted",
    icon: Trash2,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  "file.view": {
    label: "File viewed",
    icon: Eye,
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-white/5",
  },
  "file.restore": {
    label: "Version restored",
    icon: Activity,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
  },
  "folder.create": {
    label: "Folder created",
    icon: FolderPlus,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
  },
  "folder.rename": {
    label: "Folder renamed",
    icon: FolderPlus,
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
  },
  "folder.delete": {
    label: "Folder deleted",
    icon: Trash2,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  "permission.grant": {
    label: "Permission granted",
    icon: Shield,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  "permission.revoke": {
    label: "Permission revoked",
    icon: Shield,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  "link.generate": {
    label: "Share link created",
    icon: Link,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  "link.access": {
    label: "Link accessed",
    icon: Link,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-900/20",
  },
  "user.login": {
    label: "User logged in",
    icon: LogIn,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
  },
  "user.invite": {
    label: "User invited",
    icon: User,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  "category.create": {
    label: "Category created",
    icon: FolderPlus,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-900/20",
  },
};

const getActionConfig = (action: string) =>
  ACTION_CONFIG[action] ?? {
    label: getAuditActionLabel(action),
    icon: Activity,
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-white/5",
  };

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

const ACTIONS = Object.keys(ACTION_CONFIG);

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterType, setFilterType] = useState("");
  const [exportFormat, setExportFormat] = useState<
    "xlsx" | "ods" | "csv" | "pdf"
  >("xlsx");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, filterAction, filterType],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 50 };
      if (filterAction) params.action = filterAction;
      if (filterType) params.resourceType = filterType;
      const res = await api.get("/audit", { params });
      return res.data as {
        logs: Array<{
          id: string;
          action: string;
          createdAt: string;
          resourceName?: string | null;
          resourceType?: string | null;
          resourceId?: string | null;
          user?: { name?: string | null; email?: string | null } | null;
          metadata?: Record<string, unknown> | null;
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      };
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: async () => {
      const res = await api.get("/audit/stats");
      return res.data as {
        total: number;
        last30Days: { uploads: number; deletes: number; logins: number };
        byAction: { action: string; count: number }[];
      };
    },
  });

  const logs = data?.logs ?? [];
  const pagination = data?.pagination;
  const stats = statsData;

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set("action", filterAction);

      params.set("format", exportFormat);
      const res = await api.get(`/audit/export?${params.toString()}`, {
        responseType: "blob",
      });

      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export audit log");
    }
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-gray-100 dark:bg-white/5 rounded-xl flex items-center justify-center">
            <Activity size={18} className="text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Audit Log
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Complete activity history for your workspace
            </p>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              {
                label: "Total Events",
                value: stats.total,
                icon: Activity,
                color:
                  "bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400",
              },
              {
                label: "Uploads (30d)",
                value: stats.last30Days.uploads,
                icon: Upload,
                color:
                  "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
              },
              {
                label: "Deletes (30d)",
                value: stats.last30Days.deletes,
                icon: Trash2,
                color:
                  "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
              },
              {
                label: "Logins (30d)",
                value: stats.last30Days.logins,
                icon: LogIn,
                color:
                  "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
                >
                  <div
                    className={`w-8 h-8 ${stat.color} rounded-lg flex items-center
                                  justify-center mb-3`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters + Export */}
        <div className="flex items-center gap-3 mb-4 flex-wrap justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Download log:
            </span>
            <select
              value={exportFormat}
              onChange={(e) =>
                setExportFormat(
                  e.target.value as "xlsx" | "ods" | "csv" | "pdf",
                )
              }
              className="px-2.5 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg
                       text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-gray-200"
            >
              <option value="xlsx">xlsx</option>
              <option value="ods">ods</option>
              <option value="csv">csv</option>
              <option value="pdf">pdf</option>
            </select>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
             text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50
             dark:hover:bg-white/5 transition-colors"
            >
              <Download size={13} />
              Download
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Filter size={13} />
            <span>Filter:</span>
          </div>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg
                       text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-gray-200"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {getAuditActionLabel(a)}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg
                       text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-gray-200"
          >
            <option value="">All types</option>
            <option value="file">Files</option>
            <option value="folder">Folders</option>
            <option value="user">Users</option>
            <option value="permission">Permissions</option>
          </select>
          {(filterAction || filterType) && (
            <button
              onClick={() => {
                setFilterAction("");
                setFilterType("");
                setPage(1);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              Clear filters
            </button>
          )}
          {pagination && (
            <span className="text-xs text-gray-400 dark:text-gray-600">
              {pagination.total} events total
            </span>
          )}
          </div>
        </div>

        {/* Log table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader
                size={20}
                className="animate-spin text-gray-400 dark:text-gray-600"
              />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity
                size={24}
                className="text-gray-300 dark:text-gray-600 mb-3"
              />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No activity yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Actions will appear here as your team uses the workspace
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-4 px-4 py-2.5
                               border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5"
              >
                <div className="col-span-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Action
                </div>
                <div className="col-span-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Resource
                </div>
                <div className="col-span-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  User
                </div>
                <div className="col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Time
                </div>
              </div>

              {/* Rows */}
              {logs.map((log) => {
                const config = getActionConfig(log.action);
                const Icon = config.icon;
                return (
                  <div
                    key={log.id}
                    className="grid grid-cols-12 gap-4 px-4 py-3
                               border-b border-gray-100 dark:border-gray-800 last:border-b-0
                               hover:bg-gray-50 dark:hover:bg-white/5 transition-colors items-center"
                  >
                    {/* Action */}
                    <div className="col-span-4 flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 ${config.bg} rounded-lg flex items-center
                                      justify-center shrink-0`}
                      >
                        <Icon size={13} className={config.color} />
                      </div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {config.label}
                      </span>
                    </div>

                    {/* Resource */}
                    <div className="col-span-3">
                      {log.resourceName ? (
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {log.resourceName}
                          </p>
                          {log.resourceType && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                              {log.resourceType}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>

                    {/* User */}
                    <div className="col-span-3">
                      {log.user ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center
                                          justify-center text-blue-700 dark:text-blue-400 text-xs font-semibold
                                          shrink-0"
                          >
                            {log.user.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                              {log.user.name}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">System</span>
                      )}
                    </div>

                    {/* Time */}
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDetailedDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Page {pagination.page} of {pagination.pages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 dark:text-gray-400
                           hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.pages, p + 1))
                }
                disabled={page === pagination.pages}
                className="p-1.5 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 dark:text-gray-400
                           hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
