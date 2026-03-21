import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

const ACTION_CONFIG: Record<
  string,
  {
    label: string;
    icon: any;
    color: string;
    bg: string;
  }
> = {
  "file.upload": {
    label: "File uploaded",
    icon: Upload,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  "file.upload.version": {
    label: "New version uploaded",
    icon: Upload,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  "file.delete": {
    label: "File deleted",
    icon: Trash2,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  "file.view": {
    label: "File viewed",
    icon: Eye,
    color: "text-gray-600",
    bg: "bg-gray-50",
  },
  "file.restore": {
    label: "Version restored",
    icon: Activity,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  "folder.create": {
    label: "Folder created",
    icon: FolderPlus,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  "folder.rename": {
    label: "Folder renamed",
    icon: FolderPlus,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  "folder.delete": {
    label: "Folder deleted",
    icon: Trash2,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  "permission.grant": {
    label: "Permission granted",
    icon: Shield,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  "permission.revoke": {
    label: "Permission revoked",
    icon: Shield,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  "link.generate": {
    label: "Share link created",
    icon: Link,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  "link.access": {
    label: "Link accessed",
    icon: Link,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  "user.login": {
    label: "User logged in",
    icon: LogIn,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  "user.invite": {
    label: "User invited",
    icon: User,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  "category.create": {
    label: "Category created",
    icon: FolderPlus,
    color: "text-teal-600",
    bg: "bg-teal-50",
  },
};

const getActionConfig = (action: string) =>
  ACTION_CONFIG[action] ?? {
    label: action,
    icon: Activity,
    color: "text-gray-600",
    bg: "bg-gray-50",
  };

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

const ACTIONS = Object.keys(ACTION_CONFIG);

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterType, setFilterType] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, filterAction, filterType],
    queryFn: async () => {
      const params: any = { page, limit: 50 };
      if (filterAction) params.action = filterAction;
      if (filterType) params.resourceType = filterType;
      const res = await api.get("/audit", { params });
      return res.data as {
        logs: any[];
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

      const res = await api.get(`/audit/export?${params.toString()}`, {
        responseType: "blob",
      });

      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
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
          <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
            <Activity size={18} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Audit Log</h1>
            <p className="text-xs text-gray-400">
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
                color: "bg-gray-50 text-gray-600",
              },
              {
                label: "Uploads (30d)",
                value: stats.last30Days.uploads,
                icon: Upload,
                color: "bg-blue-50 text-blue-600",
              },
              {
                label: "Deletes (30d)",
                value: stats.last30Days.deletes,
                icon: Trash2,
                color: "bg-red-50 text-red-600",
              },
              {
                label: "Logins (30d)",
                value: stats.last30Days.logins,
                icon: LogIn,
                color: "bg-green-50 text-green-600",
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div
                    className={`w-8 h-8 ${stat.color} rounded-lg flex items-center
                                  justify-center mb-3`}
                  >
                    <Icon size={16} />
                  </div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Filter size={13} />
            <span>Filter:</span>
          </div>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg
                       text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_CONFIG[a]?.label ?? a}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg
                       text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
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
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear filters
            </button>
          )}
          {pagination && (
            <span className="ml-auto text-xs text-gray-400">
              {pagination.total} events total
            </span>
          )}
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
             text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50
             transition-colors ml-auto"
        >
          <Download size={14} />
          Export CSV
        </button>

        {/* Log table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader size={20} className="animate-spin text-gray-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity size={24} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">
                No activity yet
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Actions will appear here as your team uses the workspace
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-4 px-4 py-2.5
                              border-b border-gray-100 bg-gray-50"
              >
                <div className="col-span-4 text-xs font-medium text-gray-500">
                  Action
                </div>
                <div className="col-span-3 text-xs font-medium text-gray-500">
                  Resource
                </div>
                <div className="col-span-3 text-xs font-medium text-gray-500">
                  User
                </div>
                <div className="col-span-2 text-xs font-medium text-gray-500">
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
                               border-b border-gray-100 last:border-b-0
                               hover:bg-gray-50 transition-colors items-center"
                  >
                    {/* Action */}
                    <div className="col-span-4 flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 ${config.bg} rounded-lg flex items-center
                                      justify-center shrink-0`}
                      >
                        <Icon size={13} className={config.color} />
                      </div>
                      <span className="text-sm font-medium text-gray-800">
                        {config.label}
                      </span>
                    </div>

                    {/* Resource */}
                    <div className="col-span-3">
                      {log.resourceName ? (
                        <div>
                          <p className="text-sm text-gray-700 truncate">
                            {log.resourceName}
                          </p>
                          {log.resourceType && (
                            <p className="text-xs text-gray-400 capitalize">
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
                            className="w-6 h-6 bg-blue-100 rounded-full flex items-center
                                          justify-center text-blue-700 text-xs font-semibold
                                          shrink-0"
                          >
                            {log.user.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 truncate">
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
                      <p className="text-xs text-gray-500">
                        {timeAgo(log.createdAt)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
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
            <p className="text-xs text-gray-500">
              Page {pagination.page} of {pagination.pages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 border border-gray-200 rounded-lg text-gray-500
                           hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() =>
                  setPage((p) => Math.min(pagination.pages, p + 1))
                }
                disabled={page === pagination.pages}
                className="p-1.5 border border-gray-200 rounded-lg text-gray-500
                           hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
