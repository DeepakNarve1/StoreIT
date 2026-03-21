import { Menu, Search, Bell, Plus, ChevronDown, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useThemeStore } from "../../store/themeStore";

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isDark, toggle } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogout = async () => {
    logout();
    navigate("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "SUPERADMIN":
        return "bg-purple-100 text-purple-700";
      case "ORG_ADMIN":
        return "bg-blue-100 text-blue-700";
      case "MANAGER":
        return "bg-green-100 text-green-700";
      case "EDITOR":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 px-4 shrink-0 z-10">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800
                   p-1.5 rounded-lg transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Search bar */}
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
            className="bg-gray-100 dark:bg-gray-800 border w-full pl-9 pr-4 py-2 border-gray-200
                       rounded-lg text-sm focus:outline-none focus:ring-2
                       focus:ring-blue-500 focus:border-transparent
                       placeholder-gray-400 text-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 ml-auto">
        {/* Upload button */}
        <button
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700
                     text-white text-sm font-medium px-3 py-1.5 rounded-lg
                     transition-colors"
        >
          <Plus size={15} />
          Upload
        </button>
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100
             dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {/* Notifications */}
        <button
          className="relative text-gray-500 hover:text-gray-700
                           hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
        >
          <Bell size={18} />
          {/* Notification dot */}
          <span
            className="absolute top-1 right-1 w-2 h-2 bg-red-500
                           rounded-full border-2 border-white"
          />
        </button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800
                       pl-1 pr-2 py-1 rounded-lg transition-colors"
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 bg-blue-600 rounded-full flex items-center
                            justify-center text-white text-xs font-semibold"
            >
              {getInitials(user?.name || "U")}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">
                {user?.name}
              </div>
              <div
                className={`text-xs px-1.5 py-0.5 rounded-full inline-block
                              ${getRoleBadgeColor(user?.role || "")}`}
              >
                {user?.role}
              </div>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          {/* Dropdown */}
          {showUserMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900
                              border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20
                              overflow-hidden"
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
                      navigate("/profile");
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300
                               hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    My Profile
                  </button>
                  <button
                    onClick={() => {
                      navigate("/admin/settings");
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300
                               hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Settings
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400
                                 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                    >
                      Sign out
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
