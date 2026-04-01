import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Mail,
  Info,
  Loader,
  X,
  Check,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Plus,
  Pencil,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { apiErrorMessage } from "../../utils/apiError";
import { useAuthStore } from "../../store/authStore";
import RoleEditorModal, {
  type RoleEditorValue,
} from "../../components/admin/RoleEditorModal";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roleProfileId?: string | null;
  roleProfile?: {
    id: string | null;
    name: string;
    baseRole: string;
    capabilities?: Record<string, boolean>;
  } | null;
  isActive: boolean;
  createdAt: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  roleProfileId?: string | null;
  roleProfile?: { id: string; name: string; baseRole: string } | null;
  expiresAt: string;
  invitedBy?: { name: string };
}

interface RoleProfile {
  id: string;
  name: string;
  description?: string | null;
  baseRole: Role;
  isSystem: boolean;
  systemKey?: string | null;
  capabilities: Record<string, boolean>;
  _count: { users: number; invites: number };
}

interface BillingStatus {
  plan: string;
  limits: { maxUsers: number | null };
  usage: { users: number };
}

type Role = "VIEWER" | "EDITOR" | "MANAGER" | "ORG_ADMIN";

const roleColors: Record<string, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700",
  ORG_ADMIN: "bg-blue-100 text-blue-700",
  MANAGER: "bg-green-100 text-green-700",
  EDITOR: "bg-yellow-100 text-yellow-700",
  VIEWER: "bg-gray-100 text-gray-600",
};

const roleHelpItems = [
  {
    label: "See files / folders",
    detail:
      "Lets the role open and browse content. Without this, people cannot really work inside that area.",
  },
  {
    label: "Add files / create folders",
    detail: "Lets the role add new content into the workspace.",
  },
  {
    label: "Edit file attributes / edit folders",
    detail: "Lets the role rename items and update basic details.",
  },
  {
    label: "Update versions",
    detail: "Lets the role upload a newer version of an existing file.",
  },
  {
    label: "Share files / folders",
    detail: "Lets the role give access to other people or create share links.",
  },
  {
    label: "Delete files / folders",
    detail: "Lets the role remove content, so this should be given carefully.",
  },
  {
    label: "See audit trails",
    detail:
      "Lets the role view activity history like who changed, downloaded, or approved something.",
  },
] as const;

const baseRoleExamples = [
  {
    name: "Viewer",
    detail:
      "Best for people who only need to open, preview, and download content.",
  },
  {
    name: "Editor",
    detail:
      "Best for people who create files, update versions, and maintain everyday content.",
  },
  {
    name: "Manager",
    detail:
      "Best for team leads who need broader control like sharing, deleting, and reviewing activity.",
  },
] as const;

const toolbarAccessExamples = [
  {
    name: "Viewer",
    detail:
      "Mostly read-only access. They can browse, search, preview, and download when allowed, but usually will not get create or upload actions.",
  },
  {
    name: "Editor",
    detail:
      "Gets everyday work actions in the toolbar and workspace, like upload, create, update, and organize content.",
  },
  {
    name: "Manager",
    detail:
      "Gets broader operational control, so they can handle team workflows and more advanced management actions.",
  },
] as const;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [isLimitError, setIsLimitError] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "users" | "invites" | "departments" | "roles"
  >("users");
  const [newDeptName, setNewDeptName] = useState("");
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(
    null,
  );
  const [inviteRoleProfileId, setInviteRoleProfileId] = useState<string>("");
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleProfile | null>(null);
  const [showRoleHelp, setShowRoleHelp] = useState(false);

  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
    error: usersErrorObj,
  } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: User[] };
    },
  });

  const serverDeptMap = useMemo(() => {
    if (!usersData?.users) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    usersData.users.forEach((u) => {
      map[u.id] = u.departmentId ?? "";
    });
    return map;
  }, [usersData]);

  const [deptOverrides, setDeptOverrides] = useState<Record<string, string>>(
    {},
  );
  const deptMap = useMemo(
    () => ({ ...serverDeptMap, ...deptOverrides }),
    [serverDeptMap, deptOverrides],
  );

  const { data: invitesData, isLoading: invitesLoading } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const res = await api.get("/users/invites");
      return res.data as { invites: Invite[] };
    },
  });

  const { data: billing } = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const res = await api.get("/billing/status");
      return res.data as BillingStatus;
    },
  });

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const res = await api.get("/users/departments");
      return res.data as {
        departments: { id: string; name: string; _count: { users: number } }[];
      };
    },
  });
  const departments = deptsData?.departments ?? [];

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["role-profiles"],
    queryFn: async () => {
      const res = await api.get("/roles");
      return res.data as { roles: RoleProfile[] };
    },
  });
  const roleProfiles = useMemo(() => rolesData?.roles ?? [], [rolesData]);

  const defaultInviteProfile = useMemo(
    () =>
      roleProfiles.find((r) => r.baseRole === "VIEWER" && r.isSystem) ??
      roleProfiles[0] ??
      null,
    [roleProfiles],
  );

  const sendInvite = useMutation({
    mutationFn: async () => {
      const profileId = inviteRoleProfileId || defaultInviteProfile?.id;
      const profile = roleProfiles.find((r) => r.id === profileId);
      const res = await api.post("/users/invite", {
        email: inviteEmail,
        role: profile?.baseRole ?? inviteRole,
        roleProfileId: profileId || undefined,
      });
      return res.data as {
        message?: string;
        code?: string;
        error?: string;
        emailSent?: boolean;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });

      const emailSent =
        data?.emailSent !== false && data?.code !== "INVITE_EMAIL_FAILED";
      if (emailSent) {
        setInviteSuccess(`Invite sent to ${inviteEmail}`);
        setInviteError("");
        setIsLimitError(false);
        setTimeout(() => setInviteSuccess(""), 4000);
      } else {
        setInviteSuccess("");
        setIsLimitError(false);
        setInviteError(
          data?.error || "Invite created, but email failed to send",
        );
      }

      setInviteEmail("");
      setInviteRole("VIEWER");
      setInviteRoleProfileId("");
    },
    onError: (err: unknown) => {
      const error = err as {
        response?: {
          status?: number;
          data?: { error?: string; code?: string };
        };
      };
      const code = error.response?.data?.code;
      const status = error.response?.status;
      if (status === 402 || code === "USER_LIMIT_REACHED") {
        setIsLimitError(true);
        setInviteError(
          error.response?.data?.error || "User limit reached for your plan.",
        );
      } else {
        setIsLimitError(false);
        setInviteError(error.response?.data?.error || "Failed to send invite");
      }
    },
  });

  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const toggleUser = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/users/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
  });

  const updateUserRole = useMutation({
    mutationFn: async ({
      id,
      role,
      roleProfileId,
    }: {
      id: string;
      role: Role;
      roleProfileId: string | null;
    }) => {
      await api.patch(`/users/${id}`, { role, roleProfileId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onSettled: () => {
      setRoleUpdatingUserId(null);
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
  });

  const createDept = useMutation({
    mutationFn: async (name: string) =>
      api.post("/users/departments", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setNewDeptName("");
    },
  });

  const deleteDept = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/departments/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["departments"] }),
  });

  const assignDept = useMutation({
    mutationFn: async ({
      userId,
      departmentId,
    }: {
      userId: string;
      departmentId: string | null;
    }) => api.patch(`/users/${userId}/department`, { departmentId }),
    onSuccess: (
      _data: unknown,
      vars: { userId: string; departmentId: string | null },
    ) => {
      setDeptOverrides((prev) => {
        const next = { ...prev };
        delete next[vars.userId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const saveRoleProfile = useMutation({
    mutationFn: async (value: RoleEditorValue) => {
      if (value.id) {
        const res = await api.patch(`/roles/${value.id}`, {
          name: value.name.trim(),
          description: value.description?.trim() || null,
          baseRole: value.baseRole,
          capabilities: value.capabilities,
        });
        return res.data;
      }
      const res = await api.post("/roles", {
        name: value.name.trim(),
        description: value.description?.trim() || null,
        baseRole: value.baseRole,
        capabilities: value.capabilities,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setRoleModalOpen(false);
      setEditingRole(null);
    },
  });

  const deleteRoleProfile = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const users = usersData?.users ?? [];
  const invites = invitesData?.invites ?? [];
  const canEditRoles =
    currentUser?.role === "ORG_ADMIN" || currentUser?.role === "SUPERADMIN";

  const maxUsers = billing?.limits?.maxUsers ?? null;
  const usedUsers = billing?.usage?.users ?? users.length;
  const atLimit = maxUsers !== null && usedUsers >= maxUsers;
  const nearLimit =
    maxUsers !== null && usedUsers >= maxUsers * 0.8 && !atLimit;

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    setIsLimitError(false);
    if (!inviteEmail.trim()) return;
    const inviteProfileId =
      inviteRoleProfileId || defaultInviteProfile?.id || "";
    const selectedRole = roleProfiles.find(
      (profile) => profile.id === inviteProfileId,
    );
    if (selectedRole) {
      setInviteRole(selectedRole.baseRole);
    }
    sendInvite.mutate();
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {atLimit && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle
                size={15}
                className="text-amber-600 dark:text-amber-500 shrink-0"
              />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You've reached your plan's user limit ({usedUsers}/{maxUsers}).
                Upgrade to invite more team members.
              </p>
            </div>
            <button
              onClick={() => navigate("/billing")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700
                         text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              Upgrade plan
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}

        {usersError && (
          <div className="mb-5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load users.{" "}
            {apiErrorMessage(usersErrorObj, "Please retry.")}
          </div>
        )}

        {nearLimit && (
          <div className="flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-blue-500 shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Approaching user limit — {usedUsers} of {maxUsers} seats used.
              </p>
            </div>
            <button
              onClick={() => navigate("/billing")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                         text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              View plans
              <ArrowUpRight size={12} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                User Management
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {usedUsers} member{usedUsers !== 1 ? "s" : ""}
                {maxUsers !== null && (
                  <span className={atLimit ? "text-amber-500 font-medium" : ""}>
                    {" "}
                    / {maxUsers} on {billing?.plan ?? "free"} plan
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (atLimit) {
                navigate("/billing");
              } else {
                setShowInviteForm(!showInviteForm);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium
                        rounded-lg transition-colors ${
                          atLimit
                            ? "bg-amber-500 hover:bg-amber-600"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
          >
            {atLimit ? (
              <>
                <ArrowUpRight size={15} />
                Upgrade to invite
              </>
            ) : (
              <>
                <UserPlus size={15} />
                Invite user
              </>
            )}
          </button>
        </div>

        {showInviteForm && !atLimit && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Send invite
            </h2>

            {inviteSuccess && (
              <div
                className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800
                              text-green-700 dark:text-green-400 text-sm px-3 py-2 rounded-lg mb-3"
              >
                <Check size={14} />
                {inviteSuccess}
              </div>
            )}

            {inviteError && (
              <div
                className={`border text-sm px-3 py-2.5 rounded-lg mb-3 ${
                  isLimitError
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {isLimitError && (
                      <AlertTriangle
                        size={14}
                        className="text-amber-600 dark:text-amber-500 mt-0.5 shrink-0"
                      />
                    )}
                    <span>{inviteError}</span>
                  </div>
                  {isLimitError && (
                    <button
                      onClick={() => navigate("/billing")}
                      className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700
                                 text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap"
                    >
                      Upgrade
                      <ArrowUpRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}

            <form
              onSubmit={handleInviteSubmit}
              className="flex gap-2 flex-wrap"
            >
              <div className="flex-1 min-w-48">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-lg
                             text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white dark:placeholder-gray-500"
                />
              </div>
              <select
                value={inviteRoleProfileId || defaultInviteProfile?.id || ""}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setInviteRoleProfileId(nextId);
                  const nextRole = roleProfiles.find(
                    (role) => role.id === nextId,
                  );
                  if (nextRole) setInviteRole(nextRole.baseRole);
                }}
                className="px-3 py-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white appearance-none"
                disabled={rolesLoading}
              >
                {roleProfiles.map((role) => (
                  <option
                    key={role.id}
                    value={role.id}
                    className="dark:bg-gray-900"
                  >
                    {role.name} ({role.baseRole.replace("_", " ")})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={sendInvite.isPending || !inviteEmail.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white
                           text-sm font-medium rounded-lg hover:bg-blue-700
                           disabled:opacity-50 transition-colors"
              >
                {sendInvite.isPending ? (
                  <Loader size={13} className="animate-spin" />
                ) : (
                  <Mail size={13} />
                )}
                {sendInvite.isPending ? "Sending…" : "Send invite"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setInviteError("");
                  setIsLimitError(false);
                }}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={15} />
              </button>
            </form>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-5 bg-gray-100 dark:bg-white/5 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "users"
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Members ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "invites"
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Pending invites ({invites.length})
          </button>
          <button
            onClick={() => setActiveTab("departments")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "departments"
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Departments ({departments.length})
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "roles"
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Roles ({roleProfiles.length})
          </button>
        </div>

        {/* ── Members tab ── */}
        {activeTab === "users" && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                <Loader
                  size={20}
                  className="animate-spin text-gray-400 dark:text-gray-200"
                />
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#1e1e1e] bg-gray-50/80 dark:bg-white/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Member
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Department
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Joined
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 dark:border-[#1e1e1e] last:border-b-0 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 bg-blue-100 dark:bg-blue-900/40 rounded-full flex items-center
                                          justify-center text-blue-700 dark:text-blue-400 text-xs font-semibold"
                          >
                            {user.name
                              ?.split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${roleColors[user.role] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                          >
                            {user.roleProfile?.name ||
                              user.role?.replace("_", " ")}
                          </span>
                          <select
                            value={
                              user.roleProfileId ??
                              roleProfiles.find(
                                (role) =>
                                  role.baseRole === user.role && role.isSystem,
                              )?.id ??
                              ""
                            }
                            disabled={
                              !canEditRoles ||
                              user.id === currentUser?.id ||
                              (updateUserRole.isPending &&
                                roleUpdatingUserId === user.id)
                            }
                            onChange={(e) => {
                              const nextRoleProfile = roleProfiles.find(
                                (role) => role.id === e.target.value,
                              );
                              if (!nextRoleProfile) return;
                              if (nextRoleProfile.id === user.roleProfileId)
                                return;
                              setRoleUpdatingUserId(user.id);
                              updateUserRole.mutate({
                                id: user.id,
                                role: nextRoleProfile.baseRole,
                                roleProfileId: nextRoleProfile.id,
                              });
                            }}
                            className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5
                                       focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white appearance-none disabled:opacity-60"
                            title={
                              !canEditRoles
                                ? "Only Org Admin can change roles"
                                : user.id === currentUser?.id
                                  ? "You cannot change your own role"
                                  : "Change user role"
                            }
                          >
                            {roleProfiles.map((role) => (
                              <option
                                key={role.id}
                                value={role.id}
                                className="dark:bg-gray-900"
                              >
                                {role.name}
                              </option>
                            ))}
                          </select>
                          {updateUserRole.isPending &&
                            roleUpdatingUserId === user.id && (
                              <Loader
                                size={13}
                                className="animate-spin text-gray-400"
                              />
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {user.department?.name ?? (
                            <span className="italic text-gray-300 dark:text-gray-600">
                              —
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            user.isActive
                              ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {user.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              toggleUser.mutate({
                                id: user.id,
                                isActive: !user.isActive,
                              })
                            }
                            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            title={
                              user.isActive ? "Disable user" : "Enable user"
                            }
                          >
                            {user.isActive ? (
                              <ToggleRight
                                size={18}
                                className="text-green-500 dark:text-green-400"
                              />
                            ) : (
                              <ToggleLeft
                                size={18}
                                className="dark:text-gray-500"
                              />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Are you sure you want to PERMANENTLY delete ${user.name}? This cannot be undone.`,
                                )
                              ) {
                                deleteUser.mutate(user.id);
                              }
                            }}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Permanently delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Invites tab ── */}
        {activeTab === "invites" && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            {invitesLoading ? (
              <div className="flex items-center justify-center py-12 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                <Loader
                  size={20}
                  className="animate-spin text-gray-400 dark:text-gray-200"
                />
              </div>
            ) : invites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mail
                  size={24}
                  className="text-gray-300 dark:text-gray-600 mb-3"
                />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  No pending invites
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Invite a team member using the button above
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-[#1e1e1e] bg-gray-50/80 dark:bg-white/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Invited by
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Expires
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr
                      key={invite.id}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Mail
                            size={14}
                            className="text-gray-400 dark:text-gray-500"
                          />
                          <span className="text-sm text-gray-800 dark:text-gray-200">
                            {invite.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[invite.role] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                        >
                          {invite.roleProfile?.name ||
                            invite.role?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {invite.invitedBy?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">
                        {new Date(invite.expiresAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => cancelInvite.mutate(invite.id)}
                          className="ml-auto block text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="Cancel invite"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Departments tab ── */}
        {activeTab === "departments" && (
          <div className="space-y-4">
            {/* Create department */}
            <div className="flex gap-2">
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  newDeptName.trim() &&
                  createDept.mutate(newDeptName.trim())
                }
                placeholder="New department name…"
                className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white dark:placeholder-gray-500"
              />
              <button
                onClick={() =>
                  newDeptName.trim() && createDept.mutate(newDeptName.trim())
                }
                disabled={!newDeptName.trim() || createDept.isPending}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white
                           rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                <Plus size={14} /> Create
              </button>
            </div>

            {/* Department list */}
            {deptsLoading ? (
              <div className="flex justify-center py-8">
                <Loader size={20} className="animate-spin text-gray-400" />
              </div>
            ) : departments.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                No departments yet. Create one above.
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                {departments.map((dept, i) => (
                  <div
                    key={dept.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < departments.length - 1
                        ? "border-b border-gray-100 dark:border-gray-800"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                        <Building2
                          size={14}
                          className="text-blue-600 dark:text-blue-400"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white">
                          {dept.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {dept._count.users} member
                          {dept._count.users !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${dept.name}"? Users will be unassigned.`,
                          )
                        )
                          deleteDept.mutate(dept.id);
                      }}
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Assign users to departments */}
            {departments.length > 0 && (
              <>
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-6">
                  Assign users to departments
                </p>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  {(usersData?.users ?? []).map((user, i) => (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        i < (usersData?.users ?? []).length - 1
                          ? "border-b border-gray-100 dark:border-gray-800"
                          : ""
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {user.email}
                        </p>
                      </div>
                      <select
                        value={deptMap[user.id] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDeptOverrides((prev) => ({
                            ...prev,
                            [user.id]: val,
                          }));
                          assignDept.mutate({
                            userId: user.id,
                            departmentId: val || null,
                          });
                        }}
                        className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg px-2 py-1.5
                                   focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white appearance-none"
                      >
                        <option value="" className="dark:bg-gray-900">
                          No department
                        </option>
                        {departments.map((d) => (
                          <option
                            key={d.id}
                            value={d.id}
                            className="dark:bg-[#0f0f0f]"
                          >
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "roles" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-900">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Role Profiles
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowRoleHelp(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                    title="Role help"
                    aria-label="Open role help"
                  >
                    <Info size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Create custom roles and tune built-in ones using the same
                  permissions as sharing.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingRole(null);
                  setRoleModalOpen(true);
                }}
                className="inline-flex w-full items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:w-auto sm:self-auto"
              >
                <Plus size={14} />
                New role
              </button>
            </div>

            {rolesLoading ? (
              <div className="flex justify-center py-10">
                <Loader size={20} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {roleProfiles.map((role) => {
                  const enabledCount = Object.values(
                    role.capabilities ?? {},
                  ).filter(Boolean).length;
                  return (
                    <div
                      key={role.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-medium ${roleColors[role.baseRole] || "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                            >
                              {role.baseRole.replace("_", " ")}
                            </span>
                            {role.isSystem && (
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                Built-in
                              </span>
                            )}
                          </div>
                          <h3 className="mt-2 text-base font-semibold text-gray-900 dark:text-white">
                            {role.name}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {role.description || "No description added yet."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingRole(role);
                              setRoleModalOpen(true);
                            }}
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                            title="Edit role"
                          >
                            <Pencil size={14} />
                          </button>
                          {!role.isSystem && (
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete "${role.name}"? Reassign anyone using it first.`,
                                  )
                                ) {
                                  deleteRoleProfile.mutate(role.id);
                                }
                              }}
                              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                              title="Delete role"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">
                            Members
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                            {role._count.users}
                          </p>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">
                            Invites
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                            {role._count.invites}
                          </p>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">
                            Enabled
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                            {enabledCount}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <RoleEditorModal
        open={roleModalOpen}
        title={editingRole ? `Edit ${editingRole.name}` : "Create Role"}
        initialRole={
          editingRole
            ? {
                id: editingRole.id,
                name: editingRole.name,
                description: editingRole.description,
                baseRole: editingRole.baseRole,
                isSystem: editingRole.isSystem,
                capabilities: editingRole.capabilities,
              }
            : null
        }
        isSaving={saveRoleProfile.isPending}
        onClose={() => {
          setRoleModalOpen(false);
          setEditingRole(null);
        }}
        onSave={(value) => saveRoleProfile.mutate(value)}
      />

      {showRoleHelp && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#111111]">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Role help
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  A quick guide to base role and the permissions that matter
                  most.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRoleHelp(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                aria-label="Close role help"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  What is base role?
                </p>
                <p className="mt-1 text-sm leading-6 text-blue-900/90 dark:text-blue-100/90">
                  Base role is the role&apos;s starting level. It tells StoreIT
                  what kind of role this is before the detailed permission
                  switches are applied.
                </p>
                <p className="mt-2 text-sm leading-6 text-blue-900/90 dark:text-blue-100/90">
                  It is there because some features still depend on role level,
                  not only on the checkboxes. Think of it as the safety rail,
                  and the permissions as the fine tuning.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Base role examples
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {baseRoleExamples.map((role) => (
                    <div
                      key={role.name}
                      className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {role.name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {role.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Toolbar and area access
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-900/90 dark:text-amber-100/90">
                  Base role also affects which actions appear in the toolbar and
                  which wider areas of StoreIT a user can access. Permissions
                  refine this, but base role is still the first signal the app
                  uses.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {toolbarAccessExamples.map((role) => (
                    <div
                      key={role.name}
                      className="rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2.5 dark:border-amber-900/50 dark:bg-black/10"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {role.name}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                        {role.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Important permissions
                </p>
                <div className="mt-3 space-y-2">
                  {roleHelpItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
