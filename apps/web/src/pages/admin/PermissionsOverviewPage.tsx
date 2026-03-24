import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  File,
  Folder,
  Users,
  Search,
  Trash2,
  Clock,
  X,
  ChevronDown,
  AlertCircle,
  Loader,
  Eye,
  Download,
  Edit3,
  CheckCircle,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { useToast } from "../../components/ui/Toast";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Permission {
  id: string;
  resourceType: "file" | "folder";
  resourceId: string;
  grantedTo: "all" | "user" | "department" | "owner";
  action: "read" | "write" | "delete" | "admin";
  capabilities: Record<string, boolean> | null;
  expiresAt: string | null;
  createdAt: string;
  isImplicit?: boolean;
  user: { id: string; name: string; email: string; role: string } | null;
  department: { id: string; name: string } | null;
  file: { id: string; name: string; mimeType: string } | null;
  folder: { id: string; name: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ACTION_COLOR: Record<string, string> = {
  read: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  write: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  owner: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const ACTION_LABEL: Record<string, string> = {
  read: "View only",
  write: "Can edit",
  delete: "Can delete",
  admin: "Full access",
  owner: "File owner",
};

const CAPABILITY_ICON: Record<string, React.ReactNode> = {
  preview_files: <Eye size={10} />,
  download_files: <Download size={10} />,
  download_folders: <Download size={10} />,
  edit_file_attrs: <Edit3 size={10} />,
  add_files: <File size={10} />,
  delete_files: <Trash2 size={10} />,
  see_files: <Eye size={10} />,
  see_folders: <Eye size={10} />,
  share_files: <Shield size={10} />,
  share_folders: <Shield size={10} />,
};

function CapabilityBadges({ caps }: { caps: Record<string, boolean> | null }) {
  if (!caps) return null;
  const active = Object.entries(caps)
    .filter(([k, v]) => v && k !== "expiration" && k !== "apply_subfolders")
    .map(([k]) => k);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {active.slice(0, 5).map((k) => (
        <span
          key={k}
          className="flex items-center gap-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded-full font-medium"
        >
          {CAPABILITY_ICON[k]}
          {k.replace(/_/g, " ")}
        </span>
      ))}
      {active.length > 5 && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5 py-0.5">
          +{active.length - 5} more
        </span>
      )}
    </div>
  );
}

// ── Permission Row ─────────────────────────────────────────────────────────────
function PermRow({
  perm,
  isExpanded,
  onToggle,
  onRevoke,
  isRevoking,
}: {
  perm: Permission;
  isExpanded: boolean;
  onToggle: () => void;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const resourceName = perm.file?.name ?? perm.folder?.name ?? "Unknown";
  const now = new Date();
  const expiresDate = perm.expiresAt ? new Date(perm.expiresAt) : null;
  const isExpired = expiresDate ? expiresDate < now : false;
  const isExpiringSoon =
    !isExpired && expiresDate
      ? expiresDate < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      : false;

  return (
    <div
      className={`border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
        isExpired ? "opacity-60" : ""
      }`}
    >
      <div
        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors items-center cursor-pointer"
        onClick={onToggle}
      >
        {/* Resource */}
        <div className="col-span-4 flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              perm.resourceType === "file"
                ? "bg-pink-50 dark:bg-pink-900/30"
                : "bg-blue-50 dark:bg-blue-900/30"
            }`}
          >
            {perm.resourceType === "file" ? (
              <File size={13} className="text-pink-500 dark:text-pink-400" />
            ) : (
              <Folder size={13} className="text-blue-500 dark:text-blue-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {resourceName}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">
              {perm.resourceType}
            </p>
          </div>
        </div>

        {/* Granted to */}
        <div className="col-span-3 min-w-0">
          {perm.grantedTo === "all" ? (
            <div className="flex items-center gap-1.5">
              <Users size={13} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">All users</span>
            </div>
          ) : perm.grantedTo === "department" ? (
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                Dept: {perm.department?.name ?? "Unknown"}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-tight">
                Department access
              </p>
            </div>
          ) : perm.grantedTo === "owner" && perm.user ? (
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1">
                {perm.user.name}
                <span className="text-[9px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ml-1">Uploader</span>
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {perm.user.email}
              </p>
            </div>
          ) : perm.user ? (
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {perm.user.name}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {perm.user.email}
              </p>
            </div>
          ) : (
            <span className="text-sm text-gray-400 italic font-medium">Unknown user</span>
          )}
        </div>

        {/* Level */}
        <div className="col-span-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_COLOR[perm.action]}`}>
            {ACTION_LABEL[perm.action]}
          </span>
        </div>

        {/* Expires */}
        <div className="col-span-2">
          {expiresDate ? (
            <span
              className={`text-xs flex items-center gap-1 ${
                isExpired
                  ? "text-red-500 dark:text-red-400"
                  : isExpiringSoon
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-400 dark:text-gray-500"
              }`}
            >
              <Clock size={11} />
              {isExpired
                ? "Expired"
                : expiresDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          ) : (
            <span className="text-xs text-gray-300 dark:text-gray-600 flex items-center gap-1">
              <CheckCircle size={11} />
              Never
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="col-span-1 flex items-center justify-end gap-1">
          {!perm.isImplicit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Revoke access to "${resourceName}"?`)) onRevoke();
              }}
              disabled={isRevoking}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-40"
              title="Revoke permission"
            >
              <Trash2 size={13} />
            </button>
          )}
          <ChevronDown
            size={13}
            className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 bg-gray-50 dark:bg-white/2 border-t border-gray-100 dark:border-gray-800">
          {perm.isImplicit && (
            <div className="mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
              ⚠️ <strong>Implicit access</strong> — This user uploaded this file and can always see it. This is not a grant you created; it cannot be revoked from here.
            </div>
          )}
          <div className="pt-3 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Granular Capabilities
              </p>
              {perm.isImplicit ? (
                <p className="text-gray-400 dark:text-gray-500 italic">Owner has implicit full access to own uploads</p>
              ) : perm.capabilities && Object.values(perm.capabilities).some(Boolean) ? (
                <CapabilityBadges caps={perm.capabilities} />
              ) : (
                <p className="text-gray-400 dark:text-gray-500 italic">
                  Using coarse action level only
                </p>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                Details
              </p>
              <div className="space-y-1.5">
                <p className="text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-600 dark:text-gray-300">Granted: </span>
                  {new Date(perm.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {perm.user && (
                  <p className="text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">User role: </span>
                    {perm.user.role?.replace("_", " ")}
                  </p>
                )}
                {perm.department && (
                  <p className="text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-600 dark:text-gray-300">Department: </span>
                    {perm.department.name}
                  </p>
                )}
                <p className="text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-600 dark:text-gray-300">Resource ID: </span>
                  <span className="font-mono text-[10px]">{perm.resourceId.slice(0, 8)}…</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PermissionsOverviewPage() {
  const queryClient = useQueryClient();
  const { add } = useToast();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "file" | "folder">("all");
  const [filterGranted, setFilterGranted] = useState<"all" | "user" | "everyone" | "department" | "owner">("all");
  const [filterAction, setFilterAction] = useState<"all" | "read" | "write" | "delete" | "admin">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["permissions-all"],
    queryFn: async () => {
      const res = await api.get("/permissions/all");
      return res.data as { permissions: Permission[]; ownerGrants: Permission[] };
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/permissions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions-all"] });
      add("Permission revoked", "success");
    },
    onError: () => add("Failed to revoke permission", "error"),
  });

  // Merge explicit permissions with implicit owner grants, deduplicating by file ID
  const explicitPerms = data?.permissions ?? [];
  const ownerGrants = data?.ownerGrants ?? [];
  const permissions = [
    ...explicitPerms,
    // Only show owner grant if no explicit permission for the same user+file already exists
    ...ownerGrants.filter(
      (og) =>
        !explicitPerms.some(
          (ep) =>
            ep.resourceId === og.resourceId &&
            ep.grantedTo === "user" &&
            ep.user?.id === og.user?.id,
        ),
    ),
  ];

  // ── Filters ────────────────────────────────────────────────────────────────
  const filtered = permissions.filter((p) => {
    if (filterType !== "all" && p.resourceType !== filterType) return false;
    if (filterGranted === "user" && p.grantedTo !== "user") return false;
    if (filterGranted === "everyone" && p.grantedTo !== "all") return false;
    if (filterGranted === "department" && p.grantedTo !== "department") return false;
    if (filterGranted === "owner" && p.grantedTo !== "owner") return false;
    if (filterAction !== "all" && p.action !== filterAction) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    const resourceName = (p.file?.name ?? p.folder?.name ?? "").toLowerCase();
    const userName = (p.user?.name ?? "").toLowerCase();
    const userEmail = (p.user?.email ?? "").toLowerCase();
    const deptName = (p.department?.name ?? "").toLowerCase();
    return (
      resourceName.includes(q) ||
      userName.includes(q) ||
      userEmail.includes(q) ||
      deptName.includes(q)
    );
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const totalFile = permissions.filter((p) => p.resourceType === "file").length;
  const totalFolder = permissions.filter((p) => p.resourceType === "folder").length;
  const totalUser = permissions.filter((p) => p.grantedTo === "user").length;
  const expiringSoon = permissions.filter((p) => {
    if (!p.expiresAt) return false;
    const d = new Date(p.expiresAt);
    return d > now && d < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  }).length;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Permissions
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {permissions.length} active grant{permissions.length !== 1 ? "s" : ""} across your organisation
              </p>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {([
            { label: "File grants", value: totalFile, icon: File, color: "text-pink-500 bg-pink-50 dark:bg-pink-900/20" },
            { label: "Folder grants", value: totalFolder, icon: Folder, color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20" },
            { label: "User-specific", value: totalUser, icon: Users, color: "text-green-500 bg-green-50 dark:bg-green-900/20" },
            { label: "Dept grants", value: permissions.filter(p => p.grantedTo === "department").length, icon: Shield, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" },
            { label: "Expiring soon", value: expiringSoon, icon: Clock, color: "text-amber-500 bg-amber-50 dark:bg-amber-900/20" },
          ] as const).map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${color}`}>
                <Icon size={16} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none mb-1">
                {value}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-52">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by resource or user…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800
                         rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-white dark:placeholder-gray-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <FilterSelect
            value={filterType}
            onChange={(v) => setFilterType(v as typeof filterType)}
            options={[
              { value: "all", label: "All types" },
              { value: "file", label: "Files only" },
              { value: "folder", label: "Folders only" },
            ]}
          />
          <FilterSelect
            value={filterGranted}
            onChange={(v) => setFilterGranted(v as typeof filterGranted)}
            options={[
              { value: "all", label: "All grants" },
              { value: "user", label: "User-specific" },
              { value: "department", label: "Departments" },
              { value: "everyone", label: "All users" },
              { value: "owner", label: "File owners" },
            ]}
          />
          <FilterSelect
            value={filterAction}
            onChange={(v) => setFilterAction(v as typeof filterAction)}
            options={[
              { value: "all", label: "All levels" },
              { value: "read", label: "View only" },
              { value: "write", label: "Can edit" },
              { value: "delete", label: "Can delete" },
              { value: "admin", label: "Full access" },
            ]}
          />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5">
            <div className="col-span-4 text-xs font-medium text-gray-500 dark:text-gray-400">Resource</div>
            <div className="col-span-3 text-xs font-medium text-gray-500 dark:text-gray-400">Granted to</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">Level</div>
            <div className="col-span-2 text-xs font-medium text-gray-500 dark:text-gray-400">Expires</div>
            <div className="col-span-1" />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader size={20} className="animate-spin text-gray-400" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <AlertCircle size={20} className="text-red-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load permissions</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-3">
                <Shield size={20} className="text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {permissions.length === 0 ? "No permissions granted yet" : "No matches found"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {permissions.length === 0
                  ? "Use the permissions panel on any file or folder to share access"
                  : "Try adjusting your filters"}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((perm) => (
                <PermRow
                  key={perm.id}
                  perm={perm}
                  isExpanded={expandedId === perm.id}
                  onToggle={() => setExpandedId(expandedId === perm.id ? null : perm.id)}
                  onRevoke={() => revoke.mutate(perm.id)}
                  isRevoking={revoke.isPending}
                />
              ))}
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-right">
            Showing {filtered.length} of {permissions.length} permission{permissions.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </AppShell>
  );
}

// ── Filter helper ─────────────────────────────────────────────────────────────
function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800
                 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-700 dark:text-gray-300"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="dark:bg-gray-900">
          {o.label}
        </option>
      ))}
    </select>
  );
}
