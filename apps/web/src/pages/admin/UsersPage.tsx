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
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import api from "../../api/axios";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy?: { name: string };
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
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("VIEWER");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "invites">("users");

  // Fetch users
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get("/users");
      return res.data as { users: User[] };
    },
  });

  // Fetch pending invites
  const { data: invitesData, isLoading: invitesLoading } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => {
      const res = await api.get("/users/invites");
      return res.data as { invites: Invite[] };
    },
  });

  // Send invite mutation
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
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setTimeout(() => setInviteSuccess(""), 4000);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setInviteError(error.response?.data?.error || "Failed to send invite");
    },
  });

  // Cancel invite
  const cancelInvite = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  // Toggle user active status
  const toggleUser = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/users/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const users = usersData?.users ?? [];
  const invites = invitesData?.invites ?? [];

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    if (!inviteEmail.trim()) return;
    sendInvite.mutate();
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Team Members
              </h1>
              <p className="text-xs text-gray-400">{users.length} members</p>
            </div>
          </div>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus size={15} />
            Invite User
          </button>
        </div>

        {/* Invite form */}
        {showInviteForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              Send Invite
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
                className="bg-red-50 border border-red-200 text-red-700 text-sm
                              px-3 py-2 rounded-lg mb-3"
              >
                {inviteError}
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
                {sendInvite.isPending ? "Sending…" : "Send Invite"}
              </button>
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white
                           rounded-lg transition-colors"
              >
                <X size={15} />
              </button>
            </form>
          </div>
        )}

        {/* Tabs */}
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
            Pending Invites ({invites.length})
          </button>
        </div>

        {/* Users tab */}
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
                      className="border-b border-gray-100 last:border-b-0
                                                  hover:bg-gray-50 transition-colors"
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
                          className={`text-xs font-medium px-2 py-1 rounded-full
                                         ${roleColors[user.role as Role] || "bg-gray-100 text-gray-600"}`}
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

        {/* Invites tab */}
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
                      className="border-b border-gray-100 last:border-b-0
                                                    hover:bg-gray-50 transition-colors"
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
                          className={`text-xs font-medium px-2 py-1 rounded-full
                                         ${roleColors[invite.role as Role] || "bg-gray-100 text-gray-600"}`}
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
                          {
                            month: "short",
                            day: "numeric",
                          },
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
      </div>
    </AppShell>
  );
}
