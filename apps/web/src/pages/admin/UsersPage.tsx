import { useState } from "react";
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

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  departmentId?: string | null;
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

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: User[] };
    },
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const users = usersData?.users ?? [];
  const invites = invitesData?.invites ?? [];

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
      <div className="max-w-4xl mx-auto">
        {atLimit && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
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
          <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-blue-500 shrink-0" />
              <p className="text-sm text-blue-800">
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
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Team Members
              </h1>
              <p className="text-xs text-gray-400">
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
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Send invite
            </h2>

            {inviteSuccess && (
              <div
                className="flex items-center gap-2 bg-green-50 border border-green-200
                              text-green-700 text-sm px-3 py-2 rounded-lg mb-3"
              >
                <Check size={14} />
                {inviteSuccess}
              </div>
            )}

            {inviteError && (
              <div
                className={`border text-sm px-3 py-2.5 rounded-lg mb-3 ${
                  isLimitError
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {isLimitError && (
                      <AlertTriangle
                        size={14}
                        className="text-amber-600 mt-0.5 shrink-0"
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
                  className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg
                             text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
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
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors"
              >
                <X size={15} />
              </button>
            </form>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "users"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Members ({users.length})
          </button>
          <button
            onClick={() => setActiveTab("invites")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "invites"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Pending invites ({invites.length})
          </button>
          <button
            onClick={() => setActiveTab("departments")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "departments"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Departments ({departments.length})
          </button>
        </div>

        {/* ── Members tab ── */}
        {activeTab === "users" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Member
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Joined
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 bg-blue-100 rounded-full flex items-center
                                          justify-center text-blue-700 text-xs font-semibold"
                          >
                            {user.name
                              ?.split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[user.role] || "bg-gray-100 text-gray-600"}`}
                        >
                          {user.role?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            user.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {user.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(user.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            toggleUser.mutate({
                              id: user.id,
                              isActive: !user.isActive,
                            })
                          }
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title={user.isActive ? "Disable user" : "Enable user"}
                        >
                          {user.isActive ? (
                            <ToggleRight size={18} className="text-green-500" />
                          ) : (
                            <ToggleLeft size={18} />
                          )}
                        </button>
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
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {invitesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={20} className="animate-spin text-gray-400" />
              </div>
            ) : invites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Mail size={24} className="text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">
                  No pending invites
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Invite a team member using the button above
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Role
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Invited by
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Expires
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr
                      key={invite.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-800">
                            {invite.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[invite.role] || "bg-gray-100 text-gray-600"}`}
                        >
                          {invite.role?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {invite.invitedBy?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {new Date(invite.expiresAt).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => cancelInvite.mutate(invite.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
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
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
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
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {departments.map((dept, i) => (
                  <div
                    key={dept.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < departments.length - 1
                        ? "border-b border-gray-100"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Building2 size={14} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {dept.name}
                        </p>
                        <p className="text-xs text-gray-400">
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
                      className="text-gray-300 hover:text-red-500 transition-colors p-1"
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
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-6">
                  Assign users to departments
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {(usersData?.users ?? []).map((user, i) => (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        i < (usersData?.users ?? []).length - 1
                          ? "border-b border-gray-100"
                          : ""
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                      <select
                        defaultValue={user.departmentId ?? ""}
                        onChange={(e) =>
                          assignDept.mutate({
                            userId: user.id,
                            departmentId: e.target.value || null,
                          })
                        }
                        className="text-xs border border-gray-300 rounded-lg px-2 py-1.5
                                   focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">No department</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
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
