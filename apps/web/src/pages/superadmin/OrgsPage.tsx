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
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { useAuthStore } from "../../store/authStore";
import api from "../../api/axios";
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
  storageBytes: number;
  _count: OrgCount;
}

interface RecentFile {
  id: string;
  name: string;
  size: number;
}

const PLANS = ["free", "starter", "pro", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

const planColors: Record<Plan, string> = {
  free: "bg-gray-100 text-gray-600",
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
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
  const { setAuth } = useAuthStore();
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

  // Fetch all orgs
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "orgs"],
    queryFn: async () => {
      const res = await api.get("/superadmin/orgs");
      return res.data as { orgs: Org[] };
    },
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

  // Change plan
  const changePlan = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      await api.patch(`/superadmin/orgs/${id}`, { plan });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "orgs"] });
    },
  });

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
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                Superadmin Portal
              </h1>
              <p className="text-xs text-gray-400">
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

        {/* Stats summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: "Total Orgs",
              value: orgs.length,
              icon: Building2,
              color: "bg-blue-50 text-blue-600",
            },
            {
              label: "Active Orgs",
              value: orgs.filter((o) => o.isActive).length,
              icon: CheckCircle,
              color: "bg-green-50 text-green-600",
            },
            {
              label: "Total Users",
              value: orgs.reduce((sum, o) => sum + o._count.users, 0),
              icon: Users,
              color: "bg-purple-50 text-purple-600",
            },
            {
              label: "Total Files",
              value: orgs.reduce((sum, o) => sum + o._count.files, 0),
              icon: FileText,
              color: "bg-orange-50 text-orange-600",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white border border-gray-200 rounded-xl p-4"
              >
                <div
                  className={`w-8 h-8 ${stat.color} rounded-lg flex items-center
                                justify-center mb-3`}
                >
                  <Icon size={16} />
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {stat.value}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-4">
          {/* Org list */}
          <div className="flex-1 min-w-0">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader size={20} className="animate-spin text-gray-400" />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        Organisation
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        Plan
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        Users
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                        Storage
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
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
                          "border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors",
                          selectedOrg?.id === org.id
                            ? "bg-blue-50"
                            : "hover:bg-gray-50",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 bg-gray-100 rounded-lg flex items-center
                                            justify-center text-gray-600 text-xs font-bold"
                            >
                              {org.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {org.name}
                              </p>
                              <p className="text-xs text-gray-400">
                                {org.slug}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={org.plan}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              changePlan.mutate({
                                id: org.id,
                                plan: e.target.value,
                              })
                            }
                            className={`text-xs font-medium px-2 py-1 rounded-full
                                       border-0 cursor-pointer
                                       ${planColors[org.plan as Plan]}`}
                          >
                            {PLANS.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Users size={13} className="text-gray-400" />
                            {org._count.users}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatBytes(org.storageBytes)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOrg.mutate({
                                id: org.id,
                                isActive: !org.isActive,
                              });
                            }}
                            className={clsx(
                              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors",
                              org.isActive
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200",
                            )}
                          >
                            {org.isActive ? (
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
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Panel header */}
                <div
                  className="flex items-center justify-between px-4 py-3
                                border-b border-gray-100 bg-gray-50"
                >
                  <span className="text-sm font-medium text-gray-900 truncate">
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
                            className="bg-gray-50 rounded-lg p-3 text-center"
                          >
                            <Icon
                              size={14}
                              className="text-gray-400 mx-auto mb-1"
                            />
                            <div className="text-sm font-semibold text-gray-900">
                              {s.value}
                            </div>
                            <div className="text-xs text-gray-400">
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

                  {/* Recent files */}
                  {statsData?.recentFiles?.length > 0 && (
                    <div>
                      <p
                        className="text-xs font-medium text-gray-400 uppercase
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
                              className="text-gray-400 shrink-0"
                            />
                            <span className="text-xs text-gray-700 truncate flex-1">
                              {file.name}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2 pt-2 border-t border-gray-100">
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
                      onClick={() =>
                        toggleOrg.mutate({
                          id: selectedOrg.id,
                          isActive: !selectedOrg.isActive,
                        })
                      }
                      className={clsx(
                        "w-full flex items-center justify-center gap-2 px-3 py-2",
                        "text-xs font-medium rounded-lg transition-colors border",
                        selectedOrg.isActive
                          ? "border-red-200 text-red-600 hover:bg-red-50"
                          : "border-green-200 text-green-600 hover:bg-green-50",
                      )}
                    >
                      {selectedOrg.isActive ? (
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
                className="bg-white rounded-2xl shadow-xl w-full max-w-md
                              overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-6 py-4
                                border-b border-gray-200"
                >
                  <h2 className="text-base font-semibold text-gray-900">
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
                      className="bg-red-50 border border-red-200 text-red-700
                                    text-sm px-4 py-3 rounded-lg"
                    >
                      {formError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Organisation
                    </p>
                    <input
                      placeholder="Organisation name"
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      placeholder="slug (e.g. acme-corp)"
                      value={form.slug}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, slug: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={form.plan}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          plan: e.target.value as Plan,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Admin User
                    </p>
                    <input
                      placeholder="Admin name"
                      value={form.adminName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminName: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="email"
                      placeholder="Admin email"
                      value={form.adminEmail}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, adminEmail: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg
                                 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg
                                   text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
