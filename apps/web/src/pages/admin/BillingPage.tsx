import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CreditCard,
  Zap,
  Building2,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Users,
  HardDrive,
} from "lucide-react";
import AppShell from "../../components/layout/AppShell";
import { useToast } from "../../components/ui/Toast";
import api from "../../api/axios";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    storage: "1 GB",
    users: 3,
    features: ["1 GB storage", "3 users", "File versioning", "Audit logs"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 27,
    storage: "10 GB",
    users: 10,
    features: [
      "10 GB storage",
      "10 users",
      "All Free features",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 79,
    storage: "100 GB",
    users: 50,
    features: [
      "100 GB storage",
      "50 users",
      "All Starter features",
      "Advanced permissions",
      "API access",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    storage: "Unlimited",
    users: null,
    features: [
      "Unlimited storage",
      "Unlimited users",
      "All Pro features",
      "Custom contract",
      "Dedicated support",
    ],
  },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const res = await api.get("/billing/status");
      return res.data as {
        plan: string;
        limits: { storageBytes: number | null; maxUsers: number | null };
        usage: { storageBytes: number; users: number };
        stripe: {
          subscriptionStatus: string | null;
          currentPeriodEnd: string | null;
        };
      };
    },
  });

  const checkout = useMutation({
    mutationFn: async (plan: string) => {
      const res = await api.post("/billing/checkout", { plan });
      return res.data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => useToast.getState().add("Failed to start checkout", "error"),
  });

  const portal = useMutation({
    mutationFn: async () => {
      const res = await api.post("/billing/portal");
      return res.data as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () =>
      useToast.getState().add("Failed to open billing portal", "error"),
  });

  const currentPlan = data?.plan ?? "free";
  const storageUsed = data?.usage.storageBytes ?? 0;
  const storageLimit = data?.limits.storageBytes;
  const usersUsed = data?.usage.users ?? 0;
  const usersLimit = data?.limits.maxUsers;
  const storagePct = storageLimit
    ? Math.min(100, Math.round((storageUsed / storageLimit) * 100))
    : 0;
  const usersPct = usersLimit
    ? Math.min(100, Math.round((usersUsed / usersLimit) * 100))
    : 0;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <CreditCard size={18} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Billing & Plans
            </h1>
            <p className="text-xs text-gray-400">
              Manage your subscription and usage
            </p>
          </div>
        </div>

        {/* Success / canceled banners */}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
            <CheckCircle size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              Subscription activated successfully! Your plan has been upgraded.
            </p>
          </div>
        )}
        {canceled && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">
              Checkout was canceled. Your plan was not changed.
            </p>
          </div>
        )}

        {/* Current usage */}
        {!isLoading && data && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current plan</p>
                <span className="text-sm font-semibold text-gray-900 capitalize">
                  {currentPlan}
                </span>
                {data.stripe.subscriptionStatus && (
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                      data.stripe.subscriptionStatus === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {data.stripe.subscriptionStatus}
                  </span>
                )}
              </div>
              {currentPlan !== "free" && (
                <button
                  onClick={() => portal.mutate()}
                  disabled={portal.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700
                             border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  <ExternalLink size={13} />
                  {portal.isPending ? "Opening…" : "Manage subscription"}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Storage */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-600">
                    Storage
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      storagePct > 90
                        ? "bg-red-500"
                        : storagePct > 75
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${storageLimit ? storagePct : 5}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {formatBytes(storageUsed)}{" "}
                  {storageLimit
                    ? `of ${formatBytes(storageLimit)}`
                    : "(unlimited)"}
                </p>
              </div>

              {/* Users */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-600">
                    Users
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      usersPct > 90
                        ? "bg-red-500"
                        : usersPct > 75
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${usersLimit ? usersPct : 5}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  {usersUsed}{" "}
                  {usersLimit ? `of ${usersLimit} users` : "users (unlimited)"}
                </p>
              </div>
            </div>

            {data.stripe.currentPeriodEnd && (
              <p className="text-xs text-gray-400 mt-3">
                Next billing date:{" "}
                {new Date(data.stripe.currentPeriodEnd).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" },
                )}
              </p>
            )}
          </div>
        )}

        {/* Plan cards */}
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          Available plans
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isDowngrade =
              PLANS.findIndex((p) => p.id === plan.id) <
              PLANS.findIndex((p) => p.id === currentPlan);

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-xl border p-4 flex flex-col ${
                  plan.popular
                    ? "border-blue-400 ring-1 ring-blue-400"
                    : "border-gray-200"
                } ${isCurrent ? "bg-blue-50" : ""}`}
              >
                {plan.popular && (
                  <span
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs px-2.5 py-0.5
                                   bg-blue-600 text-white rounded-full font-medium whitespace-nowrap"
                  >
                    Most popular
                  </span>
                )}

                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {plan.id === "enterprise" ? (
                      <Building2 size={14} className="text-gray-400" />
                    ) : (
                      <Zap size={14} className="text-blue-500" />
                    )}
                    <span className="text-sm font-semibold text-gray-900">
                      {plan.name}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xl font-bold text-gray-900">
                    {plan.price === null
                      ? "Custom"
                      : plan.price === 0
                        ? "Free"
                        : `$${plan.price}`}
                    {plan.price && plan.price > 0 && (
                      <span className="text-xs font-normal text-gray-400">
                        /mo
                      </span>
                    )}
                  </div>
                </div>

                <ul className="space-y-1.5 mb-4 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-1.5 text-xs text-gray-600"
                    >
                      <CheckCircle
                        size={11}
                        className="text-green-500 shrink-0"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="w-full text-center py-1.5 text-xs text-blue-600 font-medium bg-blue-100 rounded-lg">
                    Active plan
                  </div>
                ) : plan.id === "free" ? (
                  <div className="w-full text-center py-1.5 text-xs text-gray-400 rounded-lg border border-gray-200">
                    Downgrade via portal
                  </div>
                ) : plan.id === "enterprise" ? (
                  <a
                    href="mailto:sales@storeit.com"
                    className="w-full text-center block py-1.5 text-xs text-gray-700
                               border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Contact sales
                  </a>
                ) : (
                  <button
                    onClick={() => checkout.mutate(plan.id)}
                    disabled={checkout.isPending}
                    className={`w-full py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      plan.popular
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {checkout.isPending
                      ? "Loading…"
                      : isDowngrade
                        ? "Downgrade"
                        : "Upgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
