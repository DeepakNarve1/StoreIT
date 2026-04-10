import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Users,
  Settings,
  Shield,
  Star,
  Trash2,
  Clock,
  Tag,
  Plus,
  Loader,
  Hash,
  X,
  Check,
  Link2,
  LayoutTemplate,
  GripVertical,
} from "lucide-react";
import clsx from "clsx";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";
import { Activity, CreditCard } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
}

interface StoreITem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { files: number; children: number };
}

interface FolderListResponse {
  folders: StoreITem[];
  showCounts: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  _count: { folders: number; files: number; children: number };
}

const NAV_ITEMS = [
  { label: "All Files", icon: Folder, path: "/browse" },
  { label: "Recent", icon: Clock, path: "/recent" },
  { label: "Starred", icon: Star, path: "/starred" },
  { label: "Tags", icon: Tag, path: "/tags" },
  { label: "Trash", icon: Trash2, path: "/trash" },
  { label: "Shared Links", icon: Link2, path: "/admin/shared-links" },
  {
    label: "Templates",
    icon: LayoutTemplate,
    path: "/admin/templates",
    adminOnly: true,
  },
];
const NAV_ORDER_KEY = "storeit_sidebar_nav_order_v1";

function mergeNavWithDefaults(order: string[]): string[] {
  const defaults = NAV_ITEMS.map((i) => i.path);
  const known = new Set(defaults);
  const cleaned = order.filter((p) => known.has(p));
  const missing = defaults.filter((p) => !cleaned.includes(p));
  return [...cleaned, ...missing];
}

// ─── Folder node (recursive) ──────────────────────────────────────────────────
function FolderNode({
  folder,
  allFolders,
  showCounts,
  depth = 0,
}: {
  folder: StoreITem;
  allFolders: StoreITem[];
  showCounts: boolean;
  depth?: number;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const children = allFolders.filter((f) => f.parentId === folder.id);
  const [expanded, setExpanded] = useState(false);
  const isActive = location.pathname === `/browse/${folder.id}`;
  const hasChildren = folder._count.children > 0;

  return (
    <div>
      <div
        className={clsx(
          "flex items-center gap-1 rounded-lg text-sm transition-colors group",
          isActive
            ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
        )}
        style={{ paddingLeft: `${10 + depth * 10}px`, paddingRight: 6 }}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className={clsx(
            "p-0.5 rounded shrink-0",
            hasChildren ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-gray-400" />
          ) : (
            <ChevronRight size={12} className="text-gray-400" />
          )}
        </button>
        <button
          onClick={() => navigate(`/browse/${folder.id}`)}
          className="flex items-center gap-1.5 flex-1 py-1 text-left min-w-0 text-xs"
        >
          {isActive ? (
            <FolderOpen size={13} className="shrink-0 text-primary-500" />
          ) : (
            <Folder
              size={13}
              className="shrink-0 text-gray-400 group-hover:text-gray-600"
            />
          )}
          <span className="truncate">{folder.name}</span>
          {showCounts && folder._count.files > 0 && (
            <span className="ml-auto text-xs text-gray-400 shrink-0">
              {folder._count.files}
            </span>
          )}
        </button>
      </div>
      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              showCounts={showCounts}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category node ────────────────────────────────────────────────────────────
function CategoryNode({
  category,
  onDelete,
  canDelete,
  hideCount = false,
}: {
  category: CategoryItem;
  onDelete: (id: string, name: string) => void;
  canDelete: boolean;
  hideCount?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === `/category/${category.id}`;
  const totalItems = category._count.folders + category._count.files;

  return (
    <div>
      <div
        className={clsx(
          "flex items-center gap-1 rounded-lg text-sm transition-colors group",
          isActive
            ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
        )}
      >
        <button
          onClick={() => navigate(`/category/${category.id}`)}
          className="flex items-center gap-1.5 flex-1 py-1 text-left min-w-0 text-xs ml-3"
        >
          <Hash
            size={13}
            className={clsx(
              "shrink-0",
              isActive
                ? "text-primary-500"
                : "text-gray-400 group-hover:text-gray-600",
            )}
          />
          <span className="truncate font-medium">{category.name}</span>
          {!hideCount && totalItems > 0 && (
            <span
              className="ml-auto text-xs text-gray-400 bg-gray-100 dark:bg-gray-800
                             px-1.5 py-0.5 rounded-full shrink-0"
            >
              {totalItems}
            </span>
          )}
        </button>
        {/* Delete button — only for privileged roles, visible on row hover */}
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(category.id, category.name);
            }}
            title="Delete category"
            className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded text-gray-400
                       hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                       transition-all shrink-0"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({ isOpen }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isViewer = user?.role === "VIEWER";
  const canWrite =
    user?.role === "SUPERADMIN" ||
    user?.roleCapabilities?.create_folders === true ||
    user?.roleCapabilities?.add_files === true ||
    ["ORG_ADMIN", "MANAGER", "EDITOR"].includes(user?.role ?? "");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [draggingNavPath, setDraggingNavPath] = useState<string | null>(null);
  const [dragOverNavPath, setDragOverNavPath] = useState<string | null>(null);
  const mergedLocal = useMemo(() => {
    if (typeof window === "undefined") return NAV_ITEMS.map((i) => i.path);
    try {
      const raw = window.localStorage.getItem(NAV_ORDER_KEY);
      if (!raw) return NAV_ITEMS.map((i) => i.path);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return NAV_ITEMS.map((i) => i.path);
      const paths = parsed.filter((x): x is string => typeof x === "string");
      return mergeNavWithDefaults(paths);
    } catch {
      return NAV_ITEMS.map((i) => i.path);
    }
  }, []);

  const { data: sidebarPrefData } = useQuery({
    queryKey: ["pref-sidebar-order"],
    queryFn: async () => {
      const res = await api.get("/preferences/sidebar-order");
      return res.data as { order: string[] };
    },
  });

  const remoteOrder = useMemo(() => {
    if (!sidebarPrefData?.order) return null;
    const o = sidebarPrefData.order.filter(
      (x): x is string => typeof x === "string",
    );
    return o.length > 0 ? mergeNavWithDefaults(o) : null;
  }, [sidebarPrefData]);

  const [manualNavOrder, setManualNavOrder] = useState<string[] | null>(null);

  const navOrder = useMemo(() => {
    const raw =
      manualNavOrder ??
      (remoteOrder && remoteOrder.length > 0 ? remoteOrder : mergedLocal);
    return mergeNavWithDefaults(raw);
  }, [manualNavOrder, remoteOrder, mergedLocal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(navOrder));
  }, [navOrder]);

  const orderedNavItems = useMemo(() => {
    const byPath = new Map(NAV_ITEMS.map((i) => [i.path, i]));
    const ordered: typeof NAV_ITEMS = [];
    navOrder.forEach((path) => {
      const item = byPath.get(path);
      if (item) ordered.push(item);
    });
    NAV_ITEMS.forEach((item) => {
      if (!ordered.some((x) => x.path === item.path)) ordered.push(item);
    });
    return ordered;
  }, [navOrder]);

  const reorderNav = (fromPath: string, toPath: string) => {
    if (!fromPath || !toPath || fromPath === toPath) return;
    setManualNavOrder((prevManual) => {
      const baseRaw =
        prevManual ??
        (remoteOrder && remoteOrder.length > 0 ? remoteOrder : mergedLocal);
      const base = [...mergeNavWithDefaults(baseRaw)];
      const fromIdx = base.indexOf(fromPath);
      const toIdx = base.indexOf(toPath);
      if (fromIdx < 0 || toIdx < 0) return prevManual;
      const [moved] = base.splice(fromIdx, 1);
      base.splice(toIdx, 0, moved);
      saveSidebarOrder.mutate(base);
      return base;
    });
  };

  const saveSidebarOrder = useMutation({
    mutationFn: async (order: string[]) => {
      await api.put("/preferences/sidebar-order", { order });
    },
  });

  // Fetch folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ["folders", "all"],
    queryFn: async () => {
      const res = await api.get("/folders/all");
      return res.data as FolderListResponse;
    },
    staleTime: 10 * 1000,
  });

  // Fetch categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await api.get("/categories");
      return res.data as { categories: CategoryItem[] };
    },
    staleTime: 30 * 1000,
  });

  // Create category mutation
  const createCategory = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post("/categories", { name, parentId: null });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setNewCategoryName("");
      setShowNewCategory(false);
    },
  });

  // Delete category mutation
  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const handleDeleteCategory = (id: string, name: string) => {
    if (
      confirm(
        `Delete category "${name}"? Files and folders will not be deleted — they'll just be uncategorised.`,
      )
    ) {
      deleteCategory.mutate(id);
    }
  };

  // Fetch storage stats
  const { data: statsData } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await api.get("/dashboard/stats");
      return res.data as {
        stats: {
          plan?: string;
          storageLimit: number | null;
          storageBytes: number;
          storageMB: number;
        };
      };
    },
    staleTime: 60 * 1000,
    enabled: !isViewer,
  });
  const stats = statsData?.stats;

  const folders = foldersData?.folders ?? [];
  const showFolderCounts = foldersData?.showCounts ?? false;
  const categories = categoriesData?.categories ?? [];
  const rootFolders = folders.filter((f) => f.parentId === null);
  const rootCategories = categories.filter((c) => c.parentId === null);

  if (!isOpen) return null;

  return (
    <aside className="w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full shrink-0">
      {/* Brand / Tenant Info */}
      <div className="h-16 flex flex-col justify-center px-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20">
            <span className="text-white text-sm font-extrabold">
              {user?.tenantName?.charAt(0).toUpperCase() || "S"}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-white text-sm truncate leading-tight">
              {user?.tenantName || "StoreIT"}
            </h2>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">
              Organization
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {/* Main Nav */}
        <div className="px-2 mb-4">
          {/* Dashboard — privileged roles only */}
          {["ORG_ADMIN", "SUPERADMIN", "MANAGER"].includes(
            user?.role ?? "",
          ) && (
            <button
              onClick={() => navigate("/")}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                location.pathname === "/"
                  ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium font"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
              )}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>
          )}
          {orderedNavItems
            .filter(
              (item) =>
                !item.adminOnly ||
                ["ORG_ADMIN", "SUPERADMIN"].includes(user?.role ?? ""),
            )
            .map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.path);
              return (
                <div
                  key={item.path}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setDragOverNavPath(item.path)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromPath = e.dataTransfer.getData(
                      "text/storeit-nav-path",
                    );
                    reorderNav(fromPath, item.path);
                    setDragOverNavPath(null);
                    setDraggingNavPath(null);
                  }}
                  className={clsx(
                    "group rounded-lg transition-all duration-200",
                    dragOverNavPath === item.path &&
                      draggingNavPath !== item.path &&
                      "bg-gray-100 dark:bg-gray-800/70",
                    draggingNavPath === item.path &&
                      "opacity-70 scale-[0.99] shadow-sm",
                  )}
                >
                  <button
                    onClick={() => navigate(item.path)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200 mb-0.5",
                      isActive
                        ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
                      draggingNavPath === item.path && "cursor-grabbing",
                    )}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "text/storeit-nav-path",
                          item.path,
                        );
                        setDraggingNavPath(item.path);
                      }}
                      onDragEnd={() => {
                        setDraggingNavPath(null);
                        setDragOverNavPath(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500"
                      title="Drag to reorder"
                    >
                      <GripVertical size={14} />
                    </span>
                    <Icon size={14} />
                    {item.label}
                  </button>
                </div>
              );
            })}
        </div>

        {/* ── CATEGORIES ─────────────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              By Category
            </span>
            {canWrite && (
              <button
                onClick={() => setShowNewCategory(true)}
                className="text-gray-400 hover:text-primary-500 transition-colors p-0.5 rounded"
                title="Add category"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>

        {/* New category input */}
        {showNewCategory && (
          <div className="px-2 mb-2">
            <div
              className="flex items-center gap-1 bg-pink-50 border border-pink-200
                            rounded-lg px-2 py-1.5"
            >
              <Hash size={12} className="text-primary-500 shrink-0" />
              <input
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategoryName.trim()) {
                    createCategory.mutate(newCategoryName.trim());
                  }
                  if (e.key === "Escape") {
                    setShowNewCategory(false);
                    setNewCategoryName("");
                  }
                }}
                placeholder="Category name…"
                className="flex-1 bg-transparent text-xs outline-none text-gray-700
                           placeholder-gray-400 min-w-0"
              />
              <button
                onClick={() => {
                  if (newCategoryName.trim())
                    createCategory.mutate(newCategoryName.trim());
                }}
                disabled={!newCategoryName.trim() || createCategory.isPending}
                className="text-primary-500 hover:text-primary-600 disabled:opacity-50 shrink-0"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => {
                  setShowNewCategory(false);
                  setNewCategoryName("");
                }}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="px-2 mb-4">
          {categoriesLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
              <Loader size={13} className="animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : rootCategories.length === 0 ? (
            <div className="px-3 py-2">
              <p className="text-xs text-gray-400 italic">No categories yet</p>
              {canWrite && (
                <button
                  onClick={() => setShowNewCategory(true)}
                  className="text-xs text-primary-500 hover:text-primary-600 mt-1 font-medium"
                >
                  + Add first category
                </button>
              )}
            </div>
          ) : (
            rootCategories.map((cat) => (
              <CategoryNode
                key={cat.id}
                category={cat}
                onDelete={handleDeleteCategory}
                canDelete={canWrite}
                hideCount={isViewer}
              />
            ))
          )}
        </div>

        {/* ── FOLDERS ────────────────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Folders
            </span>
            {canWrite && (
              <button
                onClick={() => navigate("/browse")}
                className="text-gray-400 hover:text-primary-500 transition-colors p-0.5 rounded"
                title="Browse all folders"
              >
                <Plus size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Folder tree */}
        <div className="px-2">
          {foldersLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-gray-400">
              <Loader size={13} className="animate-spin" />
              <span className="text-xs">Loading folders…</span>
            </div>
          ) : rootFolders.length === 0 ? (
            <div className="px-3 py-2">
              <p className="text-xs text-gray-400 italic">No folders yet</p>
              {canWrite && (
                <button
                  onClick={() => navigate("/browse")}
                  className="text-xs text-primary-500 hover:text-primary-600 mt-1 font-medium"
                >
                  + Create your first folder
                </button>
              )}
            </div>
          ) : (
            rootFolders.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              allFolders={folders}
              showCounts={showFolderCounts}
            />
          ))
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-2 shrink-0">
        {user?.role === "SUPERADMIN" && (
          <button
            onClick={() => navigate("/superadmin/orgs")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs
               text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors font-medium"
          >
            <Shield size={14} />
            <span>Organisation</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/users")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs
                     text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Users size={14} />
            <span>User Management</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/billing")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs
               text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <CreditCard size={14} />
            <span>Billing</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/audit")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs
               text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Activity size={14} />
            <span>Audit Log</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/permissions")}
            className={clsx(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors",
              location.pathname === "/admin/permissions"
                ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
            )}
          >
            <Shield size={14} />
            <span>Permissions</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/settings")}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs
                     text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        )}
        {/* Storage quota */}
        {!isViewer &&
          stats &&
          (() => {
            const cap = stats.storageLimit;
            const unlimited = cap === null || cap > 1e15;
            const pct =
              unlimited || !cap
                ? 5
                : Math.min(100, Math.round((stats.storageBytes / cap) * 100));
            const barTone = unlimited
              ? "bg-primary-500"
              : stats.storageBytes / cap > 0.9
                ? "bg-red-500"
                : stats.storageBytes / cap > 0.75
                  ? "bg-amber-500"
                  : "bg-primary-500";
            return (
              <div className="mx-2 mb-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Storage
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                    {stats.plan}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${barTone}`}
                    style={{
                      width: unlimited ? "5%" : `${pct}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {stats.storageMB < 1024
                    ? `${stats.storageMB} MB`
                    : `${(stats.storageMB / 1024).toFixed(1)} GB`}
                  {cap !== null &&
                    cap <= 1e15 &&
                    ` of ${Math.round(cap / 1024 / 1024 / 1024)} GB used`}
                </p>
              </div>
            );
          })()}
      </div>
    </aside>
  );
}
