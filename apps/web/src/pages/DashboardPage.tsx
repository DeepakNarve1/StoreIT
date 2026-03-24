import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Image,
  Film,
  Archive,
  Music,
  File,
  Upload,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import api from "../api/axios";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const h = hours % 12 || 12;
  const day = d.getDate();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${h}:${mins}${ampm}, ${day} ${months[d.getMonth()]}`;
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith("image/"))
    return {
      icon: Image,
      bg: "bg-pink-100 dark:bg-pink-900/40",
      color: "text-pink-500",
    };
  if (mimeType.startsWith("video/"))
    return {
      icon: Film,
      bg: "bg-green-100 dark:bg-green-900/40",
      color: "text-green-500",
    };
  if (mimeType.startsWith("audio/"))
    return {
      icon: Music,
      bg: "bg-green-100 dark:bg-green-900/40",
      color: "text-green-500",
    };
  if (mimeType.includes("pdf"))
    return {
      icon: FileText,
      bg: "bg-red-100 dark:bg-red-900/40",
      color: "text-red-500",
    };
  if (mimeType.includes("zip"))
    return {
      icon: Archive,
      bg: "bg-yellow-100 dark:bg-yellow-900/40",
      color: "text-yellow-500",
    };
  return {
    icon: File,
    bg: "bg-gray-100 dark:bg-gray-800",
    color: "text-gray-500",
  };
};

function StorageRing({
  usedBytes,
  totalBytes,
}: {
  usedBytes: number;
  totalBytes: number;
}) {
  const pct =
    totalBytes > 0 ? Math.min((usedBytes / totalBytes) * 100, 100) : 0;
  const r = 70;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 180, height: 180 }}
    >
      <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="12"
        />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="12"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-2xl font-bold">
          {pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%
        </span>
        <span className="text-xs opacity-80 mt-0.5">Space used</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
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
          storageBytes: number;
          storageMB: number;
          storageLimit?: number;
          plan?: string;
        };
        recentFiles: any[];
      };
    },
    refetchInterval: 30000,
  });

  const stats = data?.stats;
  const recentFiles = data?.recentFiles ?? [];
  const totalBytes = stats?.storageLimit ?? 100 * 1024 * 1024 * 1024;

  const docFiles = recentFiles.filter(
    (f) =>
      f.mimeType.includes("pdf") ||
      f.mimeType.includes("word") ||
      f.mimeType.includes("text"),
  );
  const imageFiles = recentFiles.filter((f) => f.mimeType.startsWith("image/"));
  const mediaFiles = recentFiles.filter(
    (f) => f.mimeType.startsWith("video/") || f.mimeType.startsWith("audio/"),
  );
  const otherFiles = recentFiles.filter(
    (f) =>
      !f.mimeType.includes("pdf") &&
      !f.mimeType.includes("word") &&
      !f.mimeType.startsWith("image/") &&
      !f.mimeType.startsWith("video/") &&
      !f.mimeType.startsWith("audio/"),
  );

  const storageGB = stats ? stats.storageBytes / 1024 / 1024 / 1024 : 0;
  const storageMB = stats ? stats.storageBytes / 1024 / 1024 : 0;
  const storageDisplay =
    storageGB >= 1
      ? `${storageGB.toFixed(1)} GB`
      : `${storageMB.toFixed(1)} MB`;
  const limitGB = totalBytes / 1024 / 1024 / 1024;
  const storageLimitDisplay =
    limitGB >= 1
      ? `${limitGB.toFixed(0)}GB`
      : `${(totalBytes / 1024 / 1024).toFixed(0)}MB`;

  const TYPE_CARDS = [
    {
      label: "Documents",
      icon: FileText,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-500",
      size: formatBytes(
        docFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      ),
      count: docFiles.length,
      lastUpdate: docFiles[0] ? formatDate(docFiles[0].createdAt) : "—",
    },
    {
      label: "Images",
      icon: Image,
      iconBg: "bg-pink-100 dark:bg-pink-900/30",
      iconColor: "text-pink-500",
      size: formatBytes(
        imageFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      ),
      count: imageFiles.length,
      lastUpdate: imageFiles[0] ? formatDate(imageFiles[0].createdAt) : "—",
    },
    {
      label: "Media",
      icon: Film,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-500",
      size: formatBytes(
        mediaFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      ),
      count: mediaFiles.length,
      lastUpdate: mediaFiles[0] ? formatDate(mediaFiles[0].createdAt) : "—",
    },
    {
      label: "Others",
      icon: Archive,
      iconBg: "bg-rose-100 dark:bg-rose-900/30",
      iconColor: "text-rose-500",
      size: formatBytes(
        otherFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      ),
      count: otherFiles.length,
      lastUpdate: otherFiles[0] ? formatDate(otherFiles[0].createdAt) : "—",
    },
  ];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Storage ring + type cards */}
          <div className="lg:col-span-3 space-y-4">
            {/* Storage hero card */}
            <div
              className="rounded-2xl p-6 flex items-center gap-8"
              style={{
                background:
                  "linear-gradient(135deg, #ff8a80 0%, #f06292 50%, #e57373 100%)",
              }}
            >
              <StorageRing
                usedBytes={stats?.storageBytes ?? 0}
                totalBytes={totalBytes}
              />
              <div className="text-white">
                <p className="text-base font-medium opacity-80 mb-1">
                  Available Storage
                </p>
                {isLoading ? (
                  <div className="h-8 w-36 bg-white/20 rounded-lg animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold tracking-tight">
                    {storageDisplay} / {storageLimitDisplay}
                  </p>
                )}
                <button
                  onClick={() => navigate("/browse")}
                  className="mt-5 flex items-center gap-2 bg-white/20 hover:bg-white/30
                             text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  <Upload size={14} /> Upload files
                </button>
              </div>
            </div>

            {/* Type cards */}
            <div className="grid grid-cols-2 gap-4">
              {TYPE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.label}
                    onClick={() => navigate("/browse")}
                    className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800
                               rounded-2xl p-5 text-left hover:shadow-md transition-all hover:-translate-y-0.5 group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`w-11 h-11 ${card.iconBg} rounded-xl flex items-center justify-center shadow-sm`}
                      >
                        <Icon size={20} className={card.iconColor} />
                      </div>
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                        {isLoading ? "—" : `${card.count} files`}
                      </span>
                    </div>
                    {isLoading ? (
                      <div className="h-6 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-2" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 dark:text-white mb-0.5">
                        {card.size}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {card.label}
                    </p>
                    <p className="text-xs text-gray-400">{card.lastUpdate}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Recent files */}
          <div
            className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-100
                          dark:border-gray-800 rounded-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: "calc(100vh - 140px)" }}
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Recent files uploaded
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
              {isLoading ? (
                <div className="p-5 space-y-4">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse shrink-0" />
                      <div className="flex-1">
                        <div className="h-3.5 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse mb-2" />
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                  <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mb-3">
                    <FileText size={24} className="text-primary-500" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    No files yet
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Upload your first file to get started
                  </p>
                  <button
                    onClick={() => navigate("/browse")}
                    className="mt-3 text-sm text-primary-500 hover:opacity-80 font-medium"
                  >
                    Go to Files →
                  </button>
                </div>
              ) : (
                recentFiles.map((file: any) => {
                  const { icon: Icon, bg, color } = getFileIcon(file.mimeType);
                  return (
                    <div
                      key={file.id}
                      onClick={() => navigate("/browse")}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50
                                 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    >
                      <div
                        className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center shrink-0`}
                      >
                        <Icon size={16} className={color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(file.createdAt ?? file.updatedAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
