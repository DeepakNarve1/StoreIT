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
} from "lucide-react";
import clsx from "clsx";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";

interface SidebarProps {
  isOpen: boolean;
}

interface FolderItem {
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
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "All Files", icon: Folder, path: "/browse" },
  { label: "Recent", icon: Clock, path: "/recent" },
  { label: "Starred", icon: Star, path: "/starred" },
  { label: "Tags", icon: Tag, path: "/tags" },
  { label: "Trash", icon: Trash2, path: "/trash" },
];

// ─── Folder node (recursive) ──────────────────────────────────────────────────
function FolderNode({
  folder,
  allFolders,
  depth = 0,
}: {
  folder: FolderItem;
  allFolders: FolderItem[];
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
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
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
            <FolderOpen size={14} className="shrink-0 text-blue-500" />
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
function CategoryNode({ category }: { category: CategoryItem }) {
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
            ? "bg-blue-50 text-blue-700 font-medium"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
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
          className="flex items-center gap-2 flex-1 py-1.5 pr-2 text-left min-w-0"
        >
          <Hash
            size={14}
            className={clsx(
              "shrink-0",
              isActive
                ? "text-blue-500"
                : "text-gray-400 group-hover:text-gray-600",
            )}
          />
          <span className="truncate font-medium">{category.name}</span>
          {totalItems > 0 && (
            <span
              className="ml-auto text-xs text-gray-400 bg-gray-100
                             px-1.5 py-0.5 rounded-full shrink-0"
            >
              {totalItems}
            </span>
          )}
        </button>
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
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Fetch folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ["folders", "root"],
    queryFn: async () => {
      const res = await api.get("/folders");
      return res.data as { folders: FolderItem[] };
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

  const folders = foldersData?.folders ?? [];
  const categories = categoriesData?.categories ?? [];
  const rootFolders = folders.filter((f) => f.parentId === null);
  const rootCategories = categories.filter((c) => c.parentId === null);

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-200 shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">F</span>
        </div>
        <span className="font-semibold text-gray-900 text-sm">
          FolderIT Clone
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {/* Main Nav */}
        <div className="px-2 mb-4">
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
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
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
              Categories
            </span>
            <button
              onClick={() => setShowNewCategory(true)}
              className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded"
              title="Add category"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* New category input */}
        {showNewCategory && (
          <div className="px-2 mb-2">
            <div
              className="flex items-center gap-1 bg-blue-50 border border-blue-200
                            rounded-lg px-2 py-1.5"
            >
              <Hash size={12} className="text-blue-400 shrink-0" />
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
                className="text-blue-500 hover:text-blue-700 disabled:opacity-50 shrink-0"
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
              <button
                onClick={() => setShowNewCategory(true)}
                className="text-xs text-blue-600 hover:text-blue-700 mt-1 font-medium"
              >
                + Add first category
              </button>
            </div>
          ) : (
            rootCategories.map((cat) => (
              <CategoryNode key={cat.id} category={cat} />
            ))
          )}
        </div>

        {/* ── FOLDERS ────────────────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Folders
            </span>
            <button
              onClick={() => navigate("/browse")}
              className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded"
              title="Browse all folders"
            >
              <Plus size={14} />
            </button>
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
              <button
                onClick={() => navigate("/browse")}
                className="text-xs text-blue-600 hover:text-blue-700 mt-1 font-medium"
              >
                + Create your first folder
              </button>
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
      <div className="border-t border-gray-200 p-2 shrink-0">
        {user?.role === "SUPERADMIN" && (
          <button
            onClick={() => navigate("/superadmin/orgs")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
               text-purple-600 hover:bg-purple-50 transition-colors font-medium"
          >
            <Shield size={16} />
            <span>Superadmin</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/users")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Users size={16} />
            <span>Admin Panel</span>
          </button>
        )}
        {(user?.role === "ORG_ADMIN" || user?.role === "SUPERADMIN") && (
          <button
            onClick={() => navigate("/admin/settings")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                     text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        )}
      </div>
    </aside>
  );
}
