import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Users,
  FileText,
  HardDrive,
  CheckCircle,
  XCircle,
  Loader,
  ChevronRight,
  Shield,
  BarChart2,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { useAuthStore } from "../../store/authStore";
import api from "../../api/axios";
import { apiErrorMessage } from "../../utils/apiError";
import clsx from "clsx";

interface OrgCount {
  users: number;
  files: number;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  isActive: boolean;
  planExpiresAt?: string | null;
  storageBytes: number;
  _count: OrgCount;
}

interface RecentFile {
  id: string;
  name: string;
  size: number;
}

type OrgUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

const PLANS = ["free", "starter", "pro", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  starter: "Mini",
  pro: "Medium",
  enterprise: "Tailor",
};

const planColors: Record<Plan, string> = {
  free: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  starter: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  pro: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function OrgsPage() {
  const queryClient = useQueryClient();
  const { setAuth, user } = useAuthStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    plan: "free" as Plan,
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [formError, setFormError] = useState("");
  const [showOrgUsers, setShowOrgUsers] = useState(false);

  // Fetch all orgs
  const {
    data,
    isLoading,
    isError: orgsError,
    error: orgsErrorObj,
  } = useQuery({
    queryKey: ["superadmin", "orgs"],
    queryFn: async () => {
      const res = await api.get("/superadmin/orgs");
      return res.data as { orgs: Org[] };
    },
    enabled: user?.role === "SUPERADMIN",
  });

  // Fetch org stats
  const { data: statsData } = useQuery({
    queryKey: ["superadmin", "org-stats", selectedOrg?.id],
    queryFn: async () => {
      if (!selectedOrg) return null;
      const res = await api.get(`/superadmin/orgs/${selectedOrg.id}/stats`);
      return res.data;
    },
    enabled: !!selectedOrg?.id,
  });

  const { data: orgUsersData, isLoading: orgUsersLoading } = useQuery({
    queryKey: ["superadmin", "org-users", selectedOrg?.id],
    queryFn: async () => {
      const res = await api.get(`/superadmin/orgs/${selectedOrg!.id}/users`);
      return res.data as { users: OrgUserRow[] };
    },
    enabled: !!selectedOrg?.id && showOrgUsers,
  });

  const setOrgUserActive = useMutation({
    mutationFn: async (vars: { orgId: string; userId: string; isActive: boolean }) => {
      const res = await api.patch(
        `/superadmin/orgs/${vars.orgId}/users/${vars.userId}`,
        { isActive: vars.isActive },
      );
      return res.data as { user: OrgUserRow };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<{ users: OrgUserRow[] }>(
        ["superadmin", "org-users", selectedOrg?.id],
        (cur) =>
          cur
            ? {
                ...cur,
                users: cur.users.map((u) => (u.id === data.user.id ? data.user : u)),
              }
            : cur,
      );
    },
  });

  // Create org
  const createOrg = useMutation({
    mutationFn: async () => {
      const res = await api.post("/superadmin/orgs", form);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "orgs"] });
      setShowCreateForm(false);
      setForm({
        name: "",
        slug: "",
        plan: "free",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      setFormError("");
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { error?: string } } };
      setFormError(
        error.response?.data?.error || "Failed to create organisation",
      );
    },
  });

  // Toggle org active status
  const toggleOrg = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await api.patch(`/superadmin/orgs/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "orgs"] });
    },
  });

  // Change plan (manual override — superadmin only)
  const changePlan = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      await api.patch(`/superadmin/orgs/${id}`, { plan });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "orgs"] });
      // Update selected org in panel if it's the one that changed
      if (selectedOrg?.id === vars.id) {
        setSelectedOrg((o) => o ? { ...o, plan: vars.plan as Plan } : o);
      }
    },
  });

  const handlePlanChange = (org: Org, newPlan: string) => {
    if (newPlan === org.plan) return;
    const label = PLAN_LABELS[newPlan as Plan] ?? newPlan;
  const confirmed = window.confirm(
      `Manually set plan to "${label}" for "${org.name}"?\n\n` +
      `⚠️ This will clear any active billing subscription link. ` +
      `Use the Billing page to manage live subscriptions.`
    );
    if (confirmed) changePlan.mutate({ id: org.id, plan: newPlan });
  };

  // Impersonate org admin
  const impersonate = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await api.post(`/superadmin/orgs/${orgId}/impersonate`);
      return res.data;
    },
    onSuccess: (data) => {
      // Save original token first
      const originalToken = localStorage.getItem("access_token");
      localStorage.setItem("original_token", originalToken || "");
      localStorage.setItem(
        "original_user",
        JSON.stringify(
          JSON.parse(localStorage.getItem("auth-storage") || "{}")?.state?.user,
        ),
      );
      // Switch to impersonated user
      setAuth(data.user, data.accessToken);
      window.location.href = "/";
    },
  });

  const orgs = data?.orgs ?? [];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    createOrg.mutate();
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);
    setForm((f) => ({ ...f, name, slug }));
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Superadmin Portal
              </h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {orgs.length} organisations
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={15} />
            New Organisation
          </button>
        </div>

        {user?.role !== "SUPERADMIN" && (
          <div className="mb-5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            Superadmin data is available only for `SUPERADMIN` accounts.
          </div>
        )}

        {orgsError && (
          <div className="mb-5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Failed to load organisations.{" "}
            {apiErrorMessage(orgsErrorObj, "Please retry.")}
          </div>
        )}

        {/* Stats summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: "Total Orgs",
              value: orgs.length,
              icon: Building2,
              color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
            },
            {
              label: "Active Orgs",
              value: orgs.filter((o) => o.isActive).length,
              icon: CheckCircle,
              color: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
            },
            {
              label: "Total Users",
              value: orgs.reduce((sum, o) => sum + o._count.users, 0),
              icon: Users,
              color: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
            },
            {
              label: "Total Files",
              value: orgs.reduce((sum, o) => sum + o._count.files, 0),
              icon: FileText,
              color: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
              >
                <div
                  className={`w-8 h-8 ${stat.color} rounded-lg flex items-center
                                justify-center mb-3`}
                >
                  <Icon size={16} />
                </div>
                <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {stat.value}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-4">
          {/* Org list */}
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader size={20} className="animate-spin text-gray-400" />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Organisation
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Plan
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Users
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Storage
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org) => (
                      <tr
                        key={org.id}
                        onClick={() => setSelectedOrg(org)}
                        className={clsx(
                          "border-b border-gray-100 dark:border-gray-800 last:border-b-0 cursor-pointer transition-colors",
                          selectedOrg?.id === org.id
                            ? "bg-blue-50 dark:bg-white/10"
                            : "hover:bg-gray-50 dark:hover:bg-white/5",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center
                                            justify-center text-gray-600 dark:text-gray-400 text-xs font-bold"
                            >
                              {org.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {org.name}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                {org.slug}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={org.plan}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePlanChange(org, e.target.value)}
                            title="Manual override — clears the live billing subscription link"
                            className={`text-xs font-medium px-3 py-1 rounded-full
                                       border-0 cursor-pointer outline-none
                                       focus:ring-2 focus:ring-blue-500/50 transition-all
                                       ${planColors[org.plan as Plan]}`}
                          >
                            {PLANS.map((p) => (
                              <option key={p} value={p} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
                                {PLAN_LABELS[p]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                            <Users size={13} className="text-gray-400 dark:text-gray-500" />
                            {org._count.users}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {formatBytes(org.storageBytes)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (org.slug === "superadmin") return;
                              toggleOrg.mutate({
                                id: org.id,
                                isActive: !org.isActive,
                              });
                            }}
                            disabled={org.slug === "superadmin"}
                            className={clsx(
                              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors",
                              org.slug === "superadmin"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 opacity-80 cursor-default"
                                : org.isActive
                                ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/40"
                                : "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/40",
                            )}
                          >
                            {org.slug === "superadmin" ? (
                              <>
                                <Shield size={11} /> Platform Admin
                              </>
                            ) : org.isActive ? (
                              <>
                                <CheckCircle size={11} /> Active
                              </>
                            ) : (
                              <>
                                <XCircle size={11} /> Suspended
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight size={14} className="text-gray-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Org detail panel */}
          {selectedOrg && (
            <div className="w-72 shrink-0">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                {/* Panel header */}
                <div
                  className="flex items-center justify-between px-4 py-3
                                border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/5"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {selectedOrg.name}
                  </span>
                  <button
                    onClick={() => setSelectedOrg(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Stats */}
                  {statsData ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          label: "Users",
                          value: statsData.stats.users,
                          icon: Users,
                        },
                        {
                          label: "Files",
                          value: statsData.stats.files,
                          icon: FileText,
                        },
                        {
                          label: "Folders",
                          value: statsData.stats.folders,
                          icon: HardDrive,
                        },
                        {
                          label: "Storage",
                          value: formatBytes(statsData.stats.storageBytes),
                          icon: BarChart2,
                        },
                      ].map((s) => {
                        const Icon = s.icon;
                        return (
                          <div
                            key={s.label}
                            className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 text-center"
                          >
                            <Icon
                              size={14}
                              className="text-gray-400 dark:text-gray-500 mx-auto mb-1"
                            />
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                              {s.value}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {s.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <Loader
                        size={16}
                        className="animate-spin text-gray-400"
                      />
                    </div>
                  )}

                  {/* Billing info */}
                  {(statsData?.tenant?.razorpayCustomerId ||
                    statsData?.tenant?.razorpaySubscriptionId) && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-2">
                        <CreditCard size={11} /> Razorpay
                      </p>
                      {statsData.tenant.razorpaySubscriptionId ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">
                          {statsData.tenant.razorpaySubscriptionId}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">No active subscription</p>
                      )}
                    </div>
                  )}

                  {/* Manual plan override warning */}
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Changing the plan here is a manual DB override. Use the org's Billing page to manage live Razorpay subscriptions.
                    </p>
                  </div>

                  {/* Recent files */}
                  {statsData?.recentFiles?.length > 0 && (
                    <div>
                      <p
                        className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase
                                    tracking-wider mb-2"
                      >
                        Recent Files
                      </p>
                      <div className="space-y-1">
                        {statsData.recentFiles.map((file: RecentFile) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-2 py-1"
                          >
                            <FileText
                              size={12}
                              className="text-gray-400 dark:text-gray-500 shrink-0"
                            />
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
                              {file.name}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => impersonate.mutate(selectedOrg.id)}
                      disabled={impersonate.isPending || !selectedOrg.isActive}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2
                                 bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                                 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      {impersonate.isPending ? (
                        <Loader size={12} className="animate-spin" />
                      ) : (
                        <Shield size={12} />
                      )}
                      Login as Org Admin
                    </button>

                    <button
                      onClick={() => setShowOrgUsers((v) => !v)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2
                                 border border-gray-200 dark:border-gray-800
                                 hover:bg-gray-50 dark:hover:bg-white/5
                                 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Users size={12} />
                      {showOrgUsers ? "Hide org users" : "Org users (recovery)"}
                    </button>

                    {showOrgUsers && (
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 space-y-2">
                        {orgUsersLoading ? (
                          <div className="flex items-center justify-center py-4 text-gray-400">
                            <Loader size={14} className="animate-spin" />
                          </div>
                        ) : (orgUsersData?.users ?? []).length === 0 ? (
                          <p className="text-xs text-gray-500">No users found.</p>
                        ) : (
                          <div className="space-y-2">
                            {(orgUsersData?.users ?? []).slice(0, 25).map((u) => (
                              <div
                                key={u.id}
                                className="flex items-center gap-2 justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                                    {u.email}
                                  </p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    {u.role} · {u.isActive ? "Active" : "Disabled"}
                                  </p>
                                </div>
                                {u.role === "SUPERADMIN" ? (
                                  <span
                                    className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border
                                               border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400"
                                    title="SUPERADMIN accounts cannot be disabled"
                                  >
                                    Protected
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      setOrgUserActive.mutate({
                                        orgId: selectedOrg.id,
                                        userId: u.id,
                                        isActive: !u.isActive,
                                      })
                                    }
                                    disabled={setOrgUserActive.isPending}
                                    className={clsx(
                                      "shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors",
                                      u.isActive
                                        ? "border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        : "border-green-200 dark:border-green-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",
                                    )}
                                    title={u.isActive ? "Disable user" : "Enable user"}
                                  >
                                    {u.isActive ? "Disable" : "Enable"}
                                  </button>
                                )}
                              </div>
                            ))}
                            {(orgUsersData?.users ?? []).length > 25 && (
                              <p className="text-[11px] text-gray-400">
                                Showing first 25 users…
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                      <button
                        onClick={() => {
                          if (selectedOrg.slug === "superadmin") return;
                          toggleOrg.mutate({
                            id: selectedOrg.id,
                            isActive: !selectedOrg.isActive,
                          });
                        }}
                        disabled={selectedOrg.slug === "superadmin"}
                        className={clsx(
                          "w-full flex items-center justify-center gap-2 px-3 py-2",
                          "text-xs font-medium rounded-lg transition-colors border",
                          selectedOrg.slug === "superadmin"
                            ? "border-purple-200 dark:border-purple-900 text-purple-600 dark:text-purple-400 opacity-50 cursor-not-allowed"
                            : selectedOrg.isActive
                            ? "border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            : "border-green-200 dark:border-green-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",
                        )}
                      >
                      {selectedOrg.slug === "superadmin" ? (
                        <>
                          <Shield size={12} /> Platform Protected
                        </>
                      ) : selectedOrg.isActive ? (
                        <>
                          <XCircle size={12} /> Suspend Organisation
                        </>
                      ) : (
                        <>
                          <CheckCircle size={12} /> Reactivate Organisation
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Org Modal */}
        {showCreateForm && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowCreateForm(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md
                              overflow-hidden border border-gray-200 dark:border-gray-800"
              >
                <div
                  className="flex items-center justify-between px-6 py-4
                                border-b border-gray-200 dark:border-gray-800"
                >
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Create Organisation
                  </h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                  {formError && (
                    <div
                      className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400
                                    text-sm px-4 py-3 rounded-lg"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Organisation
                    </p>
                    <input
                      placeholder="Organisation name"
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                    <input
                      placeholder="slug (e.g. acme-corp)"
                      value={form.slug}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, slug: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                    <select
                      value={form.plan}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          plan: e.target.value as Plan,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white transition-all cursor-pointer"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
                          {PLAN_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      Admin User
                    </p>
                    <input
                      placeholder="Admin name"
                      value={form.adminName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminName: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                    <input
                      type="email"
                      placeholder="Admin email"
                      value={form.adminEmail}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminEmail: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                    />
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Admin password (min 8 chars)"
                        value={form.adminPassword}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            adminPassword: e.target.value,
                          }))
                        }
                        required
                        className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg
                                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2
                                   text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={createOrg.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                               text-white font-medium py-2 px-4 rounded-lg text-sm
                               transition-colors"
                  >
                    {createOrg.isPending ? "Creating…" : "Create Organisation"}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
