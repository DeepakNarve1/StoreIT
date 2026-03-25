import { useState } from "react";
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
];

// ─── Folder node (recursive) ──────────────────────────────────────────────────
function FolderNode({
  folder,
  allFolders,
  depth = 0,
}: {
  folder: StoreITem;
  allFolders: StoreITem[];
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
        style={{ paddingLeft: `${12 + depth * 12}px`, paddingRight: 8 }}
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
          className="flex items-center gap-2 flex-1 py-1.5 text-left min-w-0"
        >
          {isActive ? (
            <FolderOpen size={14} className="shrink-0 text-primary-500" />
          ) : (
            <Folder
              size={14}
              className="shrink-0 text-gray-400 group-hover:text-gray-600"
            />
          )}
          <span className="truncate">{folder.name}</span>
          {folder._count.files > 0 && (
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
}: {
  category: CategoryItem;
  onDelete: (id: string, name: string) => void;
  canDelete: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
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
          onClick={() => setExpanded((e) => !e)}
          className={clsx(
            "p-0.5 rounded shrink-0 ml-3",
            totalItems > 0 ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-gray-400" />
          ) : (
            <ChevronRight size={12} className="text-gray-400" />
          )}
        </button>
        <button
          onClick={() => navigate(`/category/${category.id}`)}
          className="flex items-center gap-2 flex-1 py-1.5 text-left min-w-0"
        >
          <Hash
            size={14}
            className={clsx(
              "shrink-0",
              isActive
                ? "text-primary-500"
                : "text-gray-400 group-hover:text-gray-600",
            )}
          />
          <span className="truncate font-medium">{category.name}</span>
          {totalItems > 0 && (
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
      {expanded && category._count.children > 0 && (
        <div>{/* render child categories here when API supports it */}</div>
      )}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({ isOpen }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canWrite = ["SUPERADMIN", "ORG_ADMIN", "MANAGER", "EDITOR"].includes(
    user?.role ?? "",
  );
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Fetch folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ["folders", "all"],
    queryFn: async () => {
      const res = await api.get("/folders/all");
      return res.data as { folders: StoreITem[] };
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
      return res.data as { stats: any };
    },
    staleTime: 60 * 1000,
  });
  const stats = statsData?.stats;

  const folders = foldersData?.folders ?? [];
  const categories = categoriesData?.categories ?? [];
  const rootFolders = folders.filter((f) => f.parentId === null);
  const rootCategories = categories.filter((c) => c.parentId === null);

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full shrink-0">
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
                  ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
              )}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </button>
          )}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5",
                  isActive
                    ? "bg-pink-50 dark:bg-pink-900/20 text-primary-500 dark:text-pink-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
                )}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* ── CATEGORIES ─────────────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
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
              />
            ))
          )}
        </div>

        {/* ── FOLDERS ────────────────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
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
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
               text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors font-medium"
          >
            <Shield size={16} />
            <span>Superadmin</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/users")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Users size={16} />
            <span>User Management</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/billing")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
               text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <CreditCard size={16} />
            <span>Billing</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/audit")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
               text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Activity size={16} />
            <span>Audit Log</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/permissions")}
            className={clsx(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              location.pathname === "/admin/permissions"
                ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white",
            )}
          >
            <Shield size={16} />
            <span>Permissions</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/settings")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        )}
        {/* Storage quota */}
        {stats && (
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
                className={`h-1.5 rounded-full transition-all ${
                  stats.storageLimit === null || stats.storageLimit > 1e15
                    ? "bg-primary-500"
                    : stats.storageBytes / stats.storageLimit > 0.9
                      ? "bg-red-500"
                      : stats.storageBytes / stats.storageLimit > 0.75
                        ? "bg-amber-500"
                        : "bg-primary-500"
                }`}
                style={{
                  width:
                    stats.storageLimit > 1e15
                      ? "5%"
                      : `${Math.min(100, Math.round((stats.storageBytes / stats.storageLimit) * 100))}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {stats.storageMB < 1024
                ? `${stats.storageMB} MB`
                : `${(stats.storageMB / 1024).toFixed(1)} GB`}
              {stats.storageLimit <= 1e15 &&
                ` of ${Math.round(stats.storageLimit / 1024 / 1024 / 1024)} GB used`}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
