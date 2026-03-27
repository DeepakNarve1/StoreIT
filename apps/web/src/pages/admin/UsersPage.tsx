import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  Mail,
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";
import { useAuthStore } from "../../store/authStore";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy?: { name: string };
}

interface BillingStatus {
  plan: string;
  limits: { maxUsers: number | null };
  usage: { users: number };
}

const ROLES = ["VIEWER", "EDITOR", "MANAGER", "ORG_ADMIN"] as const;
type Role = (typeof ROLES)[number];

const roleColors: Record<string, string> = {
  SUPERADMIN: "bg-purple-100 text-purple-700",
  ORG_ADMIN: "bg-blue-100 text-blue-700",
  MANAGER: "bg-green-100 text-green-700",
  EDITOR: "bg-yellow-100 text-yellow-700",
  VIEWER: "bg-gray-100 text-gray-600",
};

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
    "users" | "invites" | "departments"
  >("users");
  const [newDeptName, setNewDeptName] = useState("");
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(
    null,
  );
  // Controlled map of userId -> departmentId for the assignment dropdowns
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: User[] };
    },
  });

  // Sync deptMap whenever usersData refreshes
  useEffect(() => {
    if (!usersData?.users) return;
    const map: Record<string, string> = {};
    usersData.users.forEach((u) => {
      map[u.id] = u.departmentId ?? "";
    });
    setDeptMap(map);
  }, [usersData]);

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

  const sendInvite = useMutation({
    mutationFn: async () => {
      const res = await api.post("/users/invite", {
        email: inviteEmail,
        role: inviteRole,
      });
      return res.data;
    },
    onSuccess: () => {
      setInviteSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteRole("VIEWER");
      setInviteError("");
      setIsLimitError(false);
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      setTimeout(() => setInviteSuccess(""), 4000);
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
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      await api.patch(`/users/${id}`, { role });
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
      // Update local controlled state immediately so dropdown reflects change
      setDeptMap((prev) => ({
        ...prev,
        [vars.userId]: vars.departmentId ?? "",
      }));
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const users = (usersData?.users ?? []).filter((u) => u.role !== "SUPERADMIN");
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
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="px-3 py-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-white appearance-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="dark:bg-gray-900">
                    {r.replace("_", " ")}
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
                            {user.role?.replace("_", " ")}
                          </span>
                          <select
                            value={user.role}
                            disabled={
                              !canEditRoles ||
                              user.id === currentUser?.id ||
                              (updateUserRole.isPending &&
                                roleUpdatingUserId === user.id)
                            }
                            onChange={(e) => {
                              const nextRole = e.target.value as Role;
                              if (nextRole === user.role) return;
                              setRoleUpdatingUserId(user.id);
                              updateUserRole.mutate({
                                id: user.id,
                                role: nextRole,
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
                            {ROLES.map((r) => (
                              <option
                                key={r}
                                value={r}
                                className="dark:bg-gray-900"
                              >
                                {r.replace("_", " ")}
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
                          {invite.role?.replace("_", " ")}
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
                          setDeptMap((prev) => ({ ...prev, [user.id]: val }));
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
      </div>
    </AppShell>
  );
}
