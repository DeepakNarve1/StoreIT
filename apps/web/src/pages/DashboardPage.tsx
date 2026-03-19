import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  FolderOpen,
  Users,
  HardDrive,
  Hash,
  Upload,
  Plus,
  Clock,
  ArrowRight,
  Image,
  Film,
  Music,
  Archive,
  File,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import { useAuthStore } from "../store/authStore";
import api from "../api/axios";
import clsx from "clsx";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-green-500", bg: "bg-green-50" };
  if (mimeType.startsWith("video/"))
    return { icon: Film, color: "text-purple-500", bg: "bg-purple-50" };
  if (mimeType.startsWith("audio/"))
    return { icon: Music, color: "text-pink-500", bg: "bg-pink-50" };
  if (mimeType.includes("pdf"))
    return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
  if (mimeType.includes("zip"))
    return { icon: Archive, color: "text-yellow-500", bg: "bg-yellow-50" };
  return { icon: File, color: "text-blue-500", bg: "bg-blue-50" };
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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await api.get("/dashboard/stats");
      return res.data as {
        stats: {
          files: number;
          folders: number;
          users: number;
          categories: number;
          storageBytes: number;
          storageMB: number;
        };
        recentFiles: any[];
      };
    },
    refetchInterval: 30000, // refresh every 30s
  });

  const stats = data?.stats;
  const recentFiles = data?.recentFiles ?? [];

  const STAT_CARDS = [
    {
      label: "Total Files",
      value: stats?.files ?? 0,
      icon: FileText,
      color: "bg-blue-50 text-blue-600",
      path: "/browse",
    },
    {
      label: "Folders",
      value: stats?.folders ?? 0,
      icon: FolderOpen,
      color: "bg-green-50 text-green-600",
      path: "/browse",
    },
    {
      label: "Team Members",
      value: stats?.users ?? 0,
      icon: Users,
      color: "bg-purple-50 text-purple-600",
      path: "/admin/users",
    },
    {
      label: "Storage Used",
      value: stats ? formatBytes(stats.storageBytes) : "0 B",
      icon: HardDrive,
      color: "bg-orange-50 text-orange-600",
      path: "/browse",
    },
  ];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Welcome back, {user?.name?.split(" ")[0]} 👋
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Here's what's happening in your workspace
            </p>
          </div>
          <button
            onClick={() => navigate("/browse")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Upload size={15} />
            Upload Files
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {STAT_CARDS.map((stat) => {
            const Icon = stat.icon;
            return (
              <button
                key={stat.label}
                onClick={() => navigate(stat.path)}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left
                           hover:border-blue-200 hover:shadow-sm transition-all"
              >
                <div
                  className={`w-9 h-9 rounded-lg ${stat.color}
                                flex items-center justify-center mb-3`}
                >
                  <Icon size={18} />
                </div>
                {isLoading ? (
                  <div className="h-7 w-12 bg-gray-100 rounded animate-pulse mb-1" />
                ) : (
                  <div className="text-2xl font-semibold text-gray-900">
                    {stat.value}
                  </div>
                )}
                <div className="text-sm text-gray-500 mt-0.5">{stat.label}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent activity */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
            <div
              className="flex items-center justify-between px-5 py-4
                            border-b border-gray-100"
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">
                  Recent Files
                </h2>
              </div>
              <button
                onClick={() => navigate("/browse")}
                className="text-xs text-blue-600 hover:text-blue-700
                           font-medium flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>

            {isLoading ? (
              <div className="p-5 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg animate-pulse" />
                    <div className="flex-1">
                      <div className="h-3.5 bg-gray-100 rounded w-48 animate-pulse mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-24 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div
                  className="w-12 h-12 bg-gray-100 rounded-full flex items-center
                                justify-center mb-3"
                >
                  <FileText size={20} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">
                  No files yet
                </p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Upload your first file to get started
                </p>
                <button
                  onClick={() => navigate("/browse")}
                  className="text-sm text-blue-600 hover:text-blue-700
                             font-medium transition-colors"
                >
                  Go to Files →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentFiles.map((file) => {
                  const { icon: Icon, color, bg } = getFileIcon(file.mimeType);
                  return (
                    <div
                      key={file.id}
                      onClick={() => navigate("/browse")}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50
                                 transition-colors cursor-pointer"
                    >
                      <div
                        className={`w-8 h-8 ${bg} rounded-lg flex items-center
                                      justify-center shrink-0`}
                      >
                        <Icon size={15} className={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {file.uploadedBy?.name ?? "Unknown"}
                          {file.folder ? ` · ${file.folder.name}` : " · Root"}
                        </p>
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {timeAgo(file.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">
                Quick Actions
              </h2>
            </div>
            <div className="p-4 space-y-2">
              {[
                {
                  label: "Upload a file",
                  desc: "Add documents to your workspace",
                  icon: Upload,
                  color: "bg-blue-50 text-blue-600",
                  path: "/browse",
                },
                {
                  label: "Create a folder",
                  desc: "Organise your documents",
                  icon: FolderOpen,
                  color: "bg-green-50 text-green-600",
                  path: "/browse",
                },
                {
                  label: "Browse categories",
                  desc: "View files by category",
                  icon: Hash,
                  color: "bg-purple-50 text-purple-600",
                  path: "/browse",
                },
                {
                  label: "Invite a teammate",
                  desc: "Collaborate on documents",
                  icon: Users,
                  color: "bg-orange-50 text-orange-600",
                  path: "/admin/users",
                },
                {
                  label: "New folder",
                  desc: "Start organising now",
                  icon: Plus,
                  color: "bg-gray-50 text-gray-600",
                  path: "/browse",
                },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => navigate(action.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl
                               hover:bg-gray-50 transition-colors text-left group"
                  >
                    <div
                      className={`w-9 h-9 ${action.color} rounded-lg flex items-center
                                    justify-center shrink-0`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {action.label}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {action.desc}
                      </p>
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-gray-300 ml-auto
                                group-hover:text-gray-500 transition-colors shrink-0"
                    />
                  </button>
                );
              })}
            </div>

            {/* Storage bar */}
            {stats && (
              <div className="px-5 py-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">
                    Storage used
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatBytes(stats.storageBytes)} / 10 GB
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min((stats.storageBytes / (10 * 1024 * 1024 * 1024)) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {10240 - Math.round(stats.storageBytes / 1024 / 1024)} MB
                  remaining
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
