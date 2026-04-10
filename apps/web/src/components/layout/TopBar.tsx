import {
  Menu,
  Search,
  Bell,
  Upload,
  ChevronDown,
  Moon,
  Sun,
  X,
  Settings,
  LogOut,
  User,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../api/axios";

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const canWrite =
    user?.role === "SUPERADMIN" ||
    user?.roleCapabilities?.add_files === true ||
    ["ORG_ADMIN", "MANAGER", "EDITOR"].includes(user?.role ?? "");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { isDark, toggle } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const { data: notificationsData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await api.get("/notifications");
      return res.data as {
        items: NotificationItem[];
        unreadCount: number;
      };
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const markNotificationRead = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllNotificationsRead = useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = notificationsData?.items ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const canViewBillingSignals = [
    "SUPERADMIN",
    "ORG_ADMIN",
    "MANAGER",
  ].includes(user?.role ?? "");
  const { data: billingSignals } = useQuery({
    queryKey: ["billing-status-banner"],
    enabled: canViewBillingSignals,
    queryFn: async () => {
      try {
        const res = await api.get("/billing/status");
        return res.data as {
          isOverStorageQuota?: boolean;
          isUserLimitReached?: boolean;
          isInGracePeriod?: boolean;
        };
      } catch {
        return null;
      }
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });
  const hasPolicyAlert =
    !!billingSignals &&
    (billingSignals.isOverStorageQuota ||
      billingSignals.isUserLimitReached ||
      billingSignals.isInGracePeriod);
  const hasHardPolicyBlock =
    !!billingSignals &&
    (billingSignals.isOverStorageQuota || billingSignals.isUserLimitReached);
  const policyAlertTitle = billingSignals?.isOverStorageQuota
    ? "Storage limit reached"
    : billingSignals?.isUserLimitReached
      ? "User seat limit reached"
      : billingSignals?.isInGracePeriod
        ? "Subscription grace period active"
        : "Billing attention needed";

  const handleLogout = async () => {
    logout();
    queryClient.clear();
    navigate("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Upload: navigate to browse with ?upload=1 so FileBrowserPage auto-opens upload zone
  const handleUpload = () => {
    navigate("/browse?upload=1");
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "SUPERADMIN":
        return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
      case "ORG_ADMIN":
        return "bg-pink-100 text-[#e91e63] dark:bg-pink-900/20 dark:text-pink-300";
      case "MANAGER":
        return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
      case "EDITOR":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 px-4 shrink-0 z-10">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white
                   hover:bg-gray-100 dark:hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files and folders..."
            className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-full
                       pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2
                       focus:ring-primary-500 focus:border-transparent placeholder-gray-400
                       text-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 ml-auto">
        {hasPolicyAlert ? (
          <button
            onClick={() => navigate("/billing")}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              hasHardPolicyBlock
                ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/35"
                : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/35"
            }`}
            title={policyAlertTitle}
          >
            <AlertTriangle size={12} />
            Plan Alert
          </button>
        ) : null}

        {/* Upload button — navigates to /browse and opens upload zone */}
        {canWrite && (
          <button
            onClick={handleUpload}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500
                       text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Upload size={15} />
            Upload
          </button>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400
                     dark:hover:bg-gray-800 transition-colors"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="relative text-gray-500 hover:text-gray-700 dark:text-gray-400
                       dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800
                       p-1.5 rounded-lg transition-colors"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNotifications(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-900
                              border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Notifications
                  </p>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllNotificationsRead.mutate()}
                        className="text-[11px] font-medium text-primary-600 hover:text-primary-500"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {notifications.length === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center px-4">
                    <Bell
                      size={24}
                      className="text-gray-300 dark:text-gray-600 mb-2"
                    />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No notifications yet
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      You're all caught up!
                    </p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto p-2">
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => {
                          if (!notification.isRead) {
                            markNotificationRead.mutate(notification.id);
                          }
                          setShowNotifications(false);
                          if (notification.link) {
                            navigate(notification.link);
                          }
                        }}
                        className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${
                          notification.isRead
                            ? "hover:bg-gray-50 dark:hover:bg-gray-800/70"
                            : "bg-primary-50/80 hover:bg-primary-50 dark:bg-primary-900/20 dark:hover:bg-primary-900/30"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              notification.isRead
                                ? "bg-gray-300 dark:bg-gray-600"
                                : "bg-primary-500"
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {notification.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {notification.message}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-400">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800
                       pl-1 pr-2 py-1 rounded-lg transition-colors"
          >
            <div
              className="w-7 h-7 bg-primary-600 rounded-full flex items-center
                            justify-center text-white text-xs font-semibold shrink-0"
            >
              {getInitials(user?.name || "U")}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">
                {user?.name}
              </div>
              <div
                className={`text-xs px-1.5 py-0.5 rounded-full inline-block ${getRoleBadgeColor(user?.role || "")}`}
              >
                {user?.role}
              </div>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900
                              border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.email}
                  </p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      navigate("/admin/settings");
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm
                               text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                  >
                    <User size={14} /> My Profile
                  </button>
                  <button
                    onClick={() => {
                      navigate("/admin/settings");
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm
                               text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                  >
                    <Settings size={14} /> Settings
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm
                                 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
