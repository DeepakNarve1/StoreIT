import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Loader,
  Link,
  Copy,
  Check,
  Clock,
  Trash2,
  AlertCircle,
  Mail,
  Send,
} from "lucide-react";
import api from "../../api/axios";
import { useToast } from "../ui/Toast";

interface PermissionsPanelProps {
  resourceId: string;
  resourceType: "file" | "folder";
  resourceName: string;
  onClose: () => void;
}

const FOLDER_PERMS = [
  { key: "create_folders", label: "Create folders" },
  { key: "see_folders", label: "See folders" },
  { key: "download_folders", label: "Download folders" },
  { key: "edit_folders", label: "Edit folders" },
  { key: "move_folders", label: "Move folders" },
  { key: "delete_folders", label: "Delete folders" },
  { key: "duplicate_folders", label: "Duplicate folders" },
  { key: "view_metadata", label: "View metadata" },
  { key: "edit_metadata", label: "Edit metadata" },
  { key: "share_folders", label: "Share folders" },
  { key: "share_public_link_folder", label: "Share with public link" },
  { key: "see_audit_trails", label: "See audit trails" },
];

const FILE_PERMS = [
  { key: "add_files", label: "Add/create files" },
  { key: "see_files", label: "See list of files" },
  { key: "preview_files", label: "Preview files" },
  { key: "download_files", label: "Download files" },
  { key: "edit_file_attrs", label: "Edit file attributes" },
  { key: "view_metadata", label: "View metadata" },
  { key: "edit_metadata", label: "Edit metadata" },
  { key: "update_versions", label: "Update file versions" },
  { key: "edit_online", label: "Edit files online" },
  { key: "move_files", label: "Move files" },
  { key: "delete_files", label: "Delete files" },
  { key: "duplicate_files", label: "Duplicate files" },
  { key: "share_files", label: "Share files" },
  { key: "share_public_link_file", label: "Share with public link" },
  { key: "see_audit_trails_file", label: "See audit trails" },
];

const ACTION_LABELS: Record<string, string> = {
  read: "View only",
  write: "Can edit",
  delete: "Can delete",
  admin: "Full access",
};

const ACTION_COLORS: Record<string, string> = {
  read: "bg-primary-50 text-primary-700",
  write: "bg-green-50 text-green-700",
  delete: "bg-red-50 text-red-700",
  admin: "bg-purple-50 text-purple-700",
};

// All checkbox keys that count as "something selected"
const ALL_PERM_KEYS = [
  ...FOLDER_PERMS.map((p) => p.key),
  ...FILE_PERMS.map((p) => p.key),
];

export default function PermissionsPanel({
  resourceId,
  resourceType,
  resourceName,
  onClose,
}: PermissionsPanelProps) {
  const queryClient = useQueryClient();
  const { add } = useToast();
  const [tab, setTab] = useState<"access" | "link" | "guest">("access");
  const [grantedTo, setGrantedTo] = useState<"all" | "user" | "department">(
    "all",
  );
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(24);

  // Guest State
  const [guestEmail, setGuestEmail] = useState("");
  const [guestLabel, setGuestLabel] = useState("");
  const [guestExpiresInDays, setGuestExpiresInDays] = useState(7);
  const [guestPerms, setGuestPerms] = useState<Record<string, boolean>>({
    preview_files: true,
    download_files: false,
    see_files: true,
  });

  // Granular permission checkboxes — derive action level from selections
  const [checkedPerms, setCheckedPerms] = useState<Record<string, boolean>>({
    see_folders: true,
    see_files: true,
    preview_files: true,
  });
  const togglePerm = (key: string) =>
    setCheckedPerms((p) => ({ ...p, [key]: !p[key] }));

  // Whether at least one real permission checkbox is checked
  const hasAnyPermChecked = ALL_PERM_KEYS.some((k) => checkedPerms[k]);

  // Derive action level from checked boxes
  const deriveAction = (): string => {
    const c = checkedPerms;
    const adminKeys = ["manage_users", "download_all_data", "modify_account"];
    if (adminKeys.some((k) => c[k])) return "admin";
    const deleteKeys = ["delete_files", "delete_folders"];
    if (deleteKeys.some((k) => c[k])) return "delete";
    const writeKeys = [
      "add_files",
      "edit_file_attrs",
      "edit_online",
      "move_files",
      "update_versions",
      "create_folders",
      "move_folders",
      "edit_folders",
      "duplicate_files",
      "duplicate_folders",
    ];
    if (writeKeys.some((k) => c[k])) return "write";
    return "read";
  };

  const { data, isLoading } = useQuery({
    queryKey: ["permissions", resourceType, resourceId],
    queryFn: async () => {
      const res = await api.get(`/permissions/${resourceType}/${resourceId}`);
      return res.data as { permissions: any[] };
    },
  });

  const {
    data: usersData,
    isError: usersError,
    isLoading: usersLoading,
  } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: any[] };
    },
    retry: false,
  });

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await api.get("/users/departments");
      return res.data as {
        departments: { id: string; name: string; _count: { users: number } }[];
      };
    },
    retry: false,
  });

  const grantPermission = useMutation({
    mutationFn: async () => {
      await api.post("/permissions", {
        resourceType,
        resourceId,
        grantedTo,
        userId: grantedTo === "user" && userId ? userId : null,
        departmentId:
          grantedTo === "department" && departmentId ? departmentId : null,
        action: deriveAction(),
        capabilities: checkedPerms,
        expiresAt:
          checkedPerms["expiration"] && expiresAt
            ? new Date(expiresAt).toISOString()
            : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["permissions", resourceType, resourceId],
      });
      add("Permission granted successfully", "success");
      // Keep grantedTo and userId so admins can easily grant to multiple users
      setExpiresAt("");
      setCheckedPerms({
        see_folders: true,
        see_files: true,
        preview_files: true,
      });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Failed to grant permission";
      add(msg, "error");
    },
  });

  const revokePermission = useMutation({
    mutationFn: async (permissionId: string) => {
      await api.delete(`/permissions/${permissionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["permissions", resourceType, resourceId],
      });
      add("Permission revoked", "success");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Failed to revoke permission";
      add(msg, "error");
    },
  });

  const generateLink = useMutation({
    mutationFn: async () => {
      const res = await api.post("/permissions/one-time-link", {
        fileId: resourceId,
        expiresInHours,
      });
      return res.data as { link: string };
    },
    onSuccess: (data) => setGeneratedLink(data.link),
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Failed to generate link";
      add(msg, "error");
    },
  });

  const generateGuestLink = useMutation({
    mutationFn: async () => {
      const res = await api.post("/guest", {
        fileId: resourceId,
        email: guestEmail,
        label: guestLabel,
        capabilities: guestPerms,
        expiresInDays: guestExpiresInDays,
      });
      return res.data;
    },
    onSuccess: () => {
      add(`Guest link sent to ${guestEmail}!`, "success");
      setGuestEmail("");
      setGuestLabel("");
      setGuestPerms({
        preview_files: true,
        download_files: false,
        see_files: true,
      });
      setTab("access"); // return to access panel
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || "Failed to create guest share";
      add(msg, "error");
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      add("Could not copy to clipboard", "error");
    }
  };

  // Minimum datetime for expiry = now (prevent past dates)
  const minDatetime = new Date().toISOString().slice(0, 16);

  const permissions = data?.permissions ?? [];
  const users = usersData?.users ?? [];
  const departments = deptsData?.departments ?? [];

  // Whether SHARE should be disabled
  const shareDisabled =
    grantPermission.isPending ||
    !hasAnyPermChecked ||
    (grantedTo === "user" && !userId) ||
    (grantedTo === "department" && !departmentId);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-primary-600 text-white shrink-0">
          <p className="text-sm font-semibold truncate max-w-xs">
            Share — {resourceName}
          </p>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={() => setTab("access")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "access" ? "border-b-2 border-primary-500 text-primary-500" : "text-gray-500 hover:text-gray-700"}`}
          >
            ACCESS
          </button>
          {resourceType === "file" && (
            <>
              <button
                onClick={() => setTab("link")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "link" ? "border-b-2 border-primary-500 text-primary-500" : "text-gray-500 hover:text-gray-700"}`}
              >
                ONE-TIME LINK
              </button>
              <button
                onClick={() => setTab("guest")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "guest" ? "border-b-2 text-primary-600 border-primary-600 bg-primary-50" : "text-gray-500 hover:text-gray-700"}`}
              >
                GUEST INVITE
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "access" && (
            <div className="p-5">
              {/* Existing permissions */}
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader size={16} className="animate-spin text-gray-400" />
                </div>
              ) : (
                permissions.length > 0 && (
                  <div className="mb-5 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Current Access ({permissions.length})
                    </p>
                    {permissions.map((perm) => (
                      <div
                        key={perm.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {perm.grantedTo === "all"
                              ? "All users"
                              : perm.grantedTo === "department"
                                ? `Dept: ${perm.department?.name ?? "Unknown department"}`
                                : perm.user?.name || "Unknown user"}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ACTION_COLORS[perm.action]}`}
                            >
                              {ACTION_LABELS[perm.action]}
                            </span>
                            {/* Show up to 3 individual capability tags if stored */}
                            {perm.capabilities &&
                              typeof perm.capabilities === "object" &&
                              Object.entries(
                                perm.capabilities as Record<string, boolean>,
                              )
                                .filter(
                                  ([k, v]) =>
                                    v &&
                                    k !== "expiration" &&
                                    k !== "apply_subfolders",
                                )
                                .slice(0, 3)
                                .map(([k]) => {
                                  const meta = [
                                    ...FOLDER_PERMS,
                                    ...FILE_PERMS,
                                  ].find((p) => p.key === k);
                                  return (
                                    <span
                                      key={k}
                                      className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                                    >
                                      {meta?.label ?? k}
                                    </span>
                                  );
                                })}
                            {perm.expiresAt && (
                              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                                <Clock size={10} />
                                {new Date(perm.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => revokePermission.mutate(perm.id)}
                          disabled={revokePermission.isPending}
                          className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Who to share with — always visible */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Share with
                </p>
                <div className="flex gap-2 mb-3">
                  {(["all", "user", "department"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setGrantedTo(type);
                        setUserId("");
                        setDepartmentId("");
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        grantedTo === type
                          ? "bg-primary-600 text-white"
                          : "bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {type === "all"
                        ? "All Users"
                        : type === "user"
                          ? "Specific User"
                          : "Department"}
                    </button>
                  ))}
                </div>
                {grantedTo === "user" && (
                  <>
                    {usersLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader
                          size={14}
                          className="animate-spin text-gray-400"
                        />
                      </div>
                    ) : usersError ? (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <AlertCircle
                          size={14}
                          className="text-red-500 shrink-0"
                        />
                        <p className="text-xs text-red-600 dark:text-red-400">
                          You don't have permission to view the user list. Ask
                          an Admin to share.
                        </p>
                      </div>
                    ) : (
                      <select
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Choose a user...</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                {grantedTo === "department" && (
                  <>
                    {deptsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader
                          size={14}
                          className="animate-spin text-gray-400"
                        />
                      </div>
                    ) : departments.length === 0 ? (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <AlertCircle
                          size={14}
                          className="text-amber-500 shrink-0"
                        />
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          No departments exist yet. Create them in User
                          Management first.
                        </p>
                      </div>
                    ) : (
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Choose a department...</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d._count.users} member
                            {d._count.users !== 1 ? "s" : ""})
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>

              {/* Granular permissions */}
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                    FOLDER
                  </p>
                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                    {FOLDER_PERMS.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!!checkedPerms[p.key]}
                          onChange={() => togglePerm(p.key)}
                          className="w-4 h-4 rounded border-gray-300 text-primary-500 accent-primary-500 cursor-pointer"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
                    FILE
                  </p>
                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                    {FILE_PERMS.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!!checkedPerms[p.key]}
                          onChange={() => togglePerm(p.key)}
                          className="w-4 h-4 rounded border-gray-300 text-primary-500 accent-primary-500 cursor-pointer"
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checkedPerms["apply_subfolders"]}
                      onChange={() => togglePerm("apply_subfolders")}
                      className="w-4 h-4 rounded border-gray-300 accent-primary-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Apply to subfolders
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2.5">
                    <input
                      type="checkbox"
                      checked={!!checkedPerms["expiration"]}
                      onChange={() => togglePerm("expiration")}
                      className="w-4 h-4 rounded border-gray-300 accent-primary-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Expiration
                    </span>
                  </label>
                  {checkedPerms["expiration"] && (
                    <input
                      type="datetime-local"
                      value={expiresAt}
                      min={minDatetime}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  )}
                </div>

                {/* No permission warning */}
                {!hasAnyPermChecked && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <AlertCircle
                      size={14}
                      className="text-amber-500 shrink-0"
                    />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Select at least one permission to share.
                    </p>
                  </div>
                )}

                {/* Derived action label */}
                {hasAnyPermChecked && (
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span className="text-xs text-gray-500">
                      Permission level
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[deriveAction()]}`}
                    >
                      {ACTION_LABELS[deriveAction()]}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => grantPermission.mutate()}
                  disabled={shareDisabled}
                  className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {grantPermission.isPending ? "Sharing..." : "SHARE"}
                </button>
              </div>
            </div>
          )}

          {tab === "link" && (
            <div className="p-5">
              <p className="text-xs text-gray-500 mb-4">
                Generate a secure one-time link. It can only be viewed once.
              </p>
              <div className="flex items-center gap-2 mb-4">
                <label className="text-xs font-medium text-gray-600 shrink-0">
                  Expires in
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="flex-1 px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:outline-none"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                </select>
              </div>
              {!generatedLink ? (
                <button
                  onClick={() => generateLink.mutate()}
                  disabled={generateLink.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                >
                  {generateLink.isPending ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Link size={14} />
                  )}
                  Generate Link
                </button>
              ) : (
                <div>
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 mb-2">
                    <p className="text-xs text-gray-600 truncate flex-1">
                      {generatedLink}
                    </p>
                    <button
                      onClick={copyLink}
                      className="shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      {copiedLink ? (
                        <Check size={13} className="text-green-500" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-amber-600 text-center mb-2">
                    ⚠️ This link works only once
                  </p>
                  <button
                    onClick={() => {
                      if (!generateLink.isPending) setGeneratedLink("");
                    }}
                    disabled={generateLink.isPending}
                    className="w-full text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate another
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "guest" && (
            <div className="p-5 flex flex-col h-full">
              <div className="mb-4">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mb-3">
                  <Mail size={24} className="text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                  Invite External Guest
                </h3>
                <p className="text-xs text-gray-500">
                  Send a secure viewing portal link directly to someone outside your organization. No account required.
                </p>
              </div>

              <div className="space-y-4 mb-6 relative">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Guest Email
                  </label>
                  <input
                    type="email"
                    placeholder="guest@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Optional Note / Label
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Q4 Financial Report Review"
                    value={guestLabel}
                    onChange={(e) => setGuestLabel(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Link Expires In
                    </label>
                    <select
                      value={guestExpiresInDays}
                      onChange={(e) => setGuestExpiresInDays(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value={1}>1 Day</option>
                      <option value={3}>3 Days</option>
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">
                    Guest Capabilities
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guestPerms.preview_files}
                        onChange={(e) =>
                          setGuestPerms({ ...guestPerms, preview_files: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Preview file in browser
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guestPerms.download_files}
                        onChange={(e) =>
                          setGuestPerms({ ...guestPerms, download_files: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Download original file
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-auto">
                <button
                  onClick={() => generateGuestLink.mutate()}
                  disabled={!guestEmail || generateGuestLink.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50"
                >
                  {generateGuestLink.isPending ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {generateGuestLink.isPending ? "Sending..." : "Send Invitation via Email"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
