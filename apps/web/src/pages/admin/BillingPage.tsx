import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Users,
  HardDrive,
  Minus,
  Plus,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { useState, useEffect } from "react";
import AppShell from "../../components/layout/AppShell";
import { useToast } from "../../components/ui/Toast";
import api from "../../api/axios";

const PLANS = [
  {
    id: "starter",
    name: "MINI",
    price: 4000,
    priceLabel: null,
    storage: "150 GB",
    users: 5,
    features: [
      { label: "150 GB storage", included: true },
      { label: "Up to 5 users", included: true },
      {
        label: "Approval, Acknowledgement & e-Sign Workflows",
        included: false,
      },
      { label: "Retention Automation", included: false },
      { label: "Document Numbering System", included: false },
      { label: "API", included: false },
      { label: "Granular Access Management", included: false },
      { label: "Priority Support", included: false },
      { label: "Entra ID, Google, Okta SSO", included: false },
      { label: "eForms & custom records", included: false },
    ],
  },
  {
    id: "pro",
    name: "MEDIUM",
    price: 9211,
    priceLabel: null,
    storage: "500 GB",
    users: 10,
    features: [
      { label: "500 GB storage", included: true },
      { label: "Up to 10 users", included: true },
      {
        label: "Approval, Acknowledgement & e-Sign Workflows",
        included: true,
        sub: "DocuSign Integration",
      },
      { label: "Retention Automation", included: true },
      { label: "Document Numbering System", included: true },
      { label: "API", included: true },
      { label: "Granular Access Management", included: false },
      { label: "Priority Support", included: false },
      { label: "Entra ID, Google, Okta SSO", included: false },
      { label: "eForms & custom records", included: false },
    ],
  },
  {
    id: "enterprise",
    name: "TAILOR",
    price: null,
    priceLabel: "Custom pricing",
    storage: "0.5 TB+",
    users: 20,
    customizable: true,
    features: [
      {
        label: "Approval, Acknowledgement & e-Sign Workflows",
        included: true,
        sub: "Unlimited Folderit eSign\nDocuSign Integration",
      },
      { label: "Retention Automation", included: true },
      { label: "Document Numbering System", included: true },
      { label: "API", included: true },
      { label: "Granular Access Management", included: true },
      { label: "Priority Support", included: true },
      { label: "Entra ID, Google, Okta SSO", included: true },
      { label: "eForms & custom records", included: true },
    ],
  },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function BillingPage() {
  const [searchParams] = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const sessionId = searchParams.get("session_id");
  const [tbValue, setTbValue] = useState(0.5);
  const [usersValue, setUsersValue] = useState(20);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // When Stripe redirects back with ?success=true&session_id=...,
  // immediately call /billing/verify to apply the plan update in the DB.
  // This works even without webhooks (important for local dev).
  const [verifyDone, setVerifyDone] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (success && sessionId && !verifyDone) {
      api
        .post("/billing/verify", { sessionId })
        .then(() => {
          setVerifyDone(true);
          queryClient.invalidateQueries({ queryKey: ["billing-status"] });
        })
        .catch(() => {
          // If verify fails (e.g. already applied), still refresh
          queryClient.invalidateQueries({ queryKey: ["billing-status"] });
        });
    } else if (success && !sessionId) {
      // Legacy: no session_id, just force a refresh
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      setPollCount(0);
    }
  }, [success, sessionId, verifyDone, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["billing-status"],
    staleTime: 0,
    // Poll every 3s only if verify hasn't completed yet (fallback for slow webhooks)
    refetchInterval: (query) => {
      if (!success || verifyDone) return false;
      const planData = query.state.data as any;
      if (pollCount >= 10) return false;
      if (planData?.plan && planData.plan !== "free") return false;
      return 3000;
    },
    queryFn: async () => {
      if (success && !verifyDone) setPollCount((c) => c + 1);
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
    onMutate: (plan) => setPendingPlan(plan),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: any) => {
      setPendingPlan(null);
      const msg = err?.response?.data?.error ?? "Failed to start checkout";
      useToast.getState().add(msg, "error");
    },
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-0">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Billing &amp; Plans
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage your subscription and usage
          </p>
        </div>
        {/* Current plan hero */}
        {!isLoading &&
          data &&
          (() => {
            const PLAN_DISPLAY: Record<string, string> = {
              free: "Free",
              starter: "MINI",
              pro: "MEDIUM",
              enterprise: "TAILOR",
            };
            const planLabel = PLAN_DISPLAY[currentPlan] ?? currentPlan;
            const renewalDate = data.stripe.currentPeriodEnd
              ? new Date(data.stripe.currentPeriodEnd).toLocaleDateString(
                  "en-IN",
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  },
                )
              : null;
            return (
              <div
                className="rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                style={{
                  background:
                    "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-widest">
                      Your current plan
                    </p>
                    <p className="text-2xl font-black text-white leading-tight">
                      {planLabel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:items-end gap-2">
                  {renewalDate && (
                    <span className="flex items-center gap-1.5 text-xs text-white/80">
                      <CalendarDays size={12} />
                      Renews {renewalDate}
                    </span>
                  )}
                  {data.stripe.subscriptionStatus && (
                    <button
                      onClick={() => portal.mutate()}
                      disabled={portal.isPending}
                      className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 text-white font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    >
                      <ExternalLink size={12} />
                      {portal.isPending ? "Opening…" : "Manage billing"}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
            <CheckCircle size={18} className="text-green-600 shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              Subscription activated successfully!
            </p>
          </div>
        )}
        {canceled && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
            <AlertTriangle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600">
              Checkout was canceled. Your plan was not changed.
            </p>
          </div>
        )}
        {/* Usage */}
        {!isLoading && data && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-8">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Current usage
            </p>
            {/* Usage bars — stacked on mobile, side-by-side on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <HardDrive size={12} /> Storage
                  </span>
                  <span>
                    {formatBytes(storageUsed)} /{" "}
                    {storageLimit ? formatBytes(storageLimit) : "∞"}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${storagePct >= 90 ? "bg-red-500" : "bg-primary-500"}`}
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> Users
                  </span>
                  <span>
                    {usersUsed} / {usersLimit ?? "∞"}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${usersPct >= 90 ? "bg-red-500" : "bg-primary-500"}`}
                    style={{ width: `${usersPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Plan cards — 1 col on mobile, 3 col on md+ */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse"
              >
                <div className="h-36 bg-gray-100 dark:bg-gray-800" />
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, j) => (
                    <div
                      key={j}
                      className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full"
                    />
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <div className="h-11 bg-gray-100 dark:bg-gray-800 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isFreePlan = currentPlan === "free";
              // If the user already has an active subscription, all plan changes
              // must go through the Stripe billing portal (not a new checkout).
              const hasActiveSub = !!data?.stripe.subscriptionStatus && !isFreePlan;
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border-2 flex flex-col overflow-hidden transition-all ${isCurrent ? "border-primary-500" : "border-gray-200 dark:border-gray-700"}`}
                >
                  {/* Price header */}
                  <div className="bg-linear-to-br from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-800 px-6 py-5 text-center border-b-2 border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-bold text-gray-600 dark:text-gray-400 tracking-widest mb-2">
                      {plan.name}
                    </p>
                    {plan.priceLabel ? (
                      <p className="text-2xl font-black text-gray-900 dark:text-white leading-none py-3">
                        {plan.priceLabel}
                      </p>
                    ) : plan.price !== null ? (
                      <div className="flex items-end justify-center gap-1">
                        <span className="text-primary-500 font-bold text-xl mb-1">
                          Rs
                        </span>
                        <span className="text-5xl font-black text-gray-900 dark:text-white leading-none">
                          {plan.price.toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                    {plan.price !== null && !plan.priceLabel && (
                      <p className="text-xs text-gray-500 mt-2">
                        + taxes
                        <br />
                        Monthly
                      </p>
                    )}
                    {isCurrent && (
                      <span className="inline-block mt-2 text-xs px-3 py-1 bg-linear-to-r from-primary-400 to-primary-500 text-white rounded-full font-semibold">
                        Current Plan
                      </span>
                    )}
                  </div>

                  {/* Features */}
                  <div className="bg-white dark:bg-gray-900 flex-1 px-6 py-5 space-y-3">
                    {/* Customizable storage/users for TAILOR */}
                    {plan.customizable && (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() =>
                              setTbValue(Math.max(0.5, tbValue - 0.5))
                            }
                            className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-8 text-center">
                            {tbValue}
                          </span>
                          <button
                            onClick={() => setTbValue(tbValue + 0.5)}
                            className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100"
                          >
                            <Plus size={10} />
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            + <strong>TB</strong> storage
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            onClick={() =>
                              setUsersValue(Math.max(1, usersValue - 1))
                            }
                            className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-8 text-center">
                            {usersValue}
                          </span>
                          <button
                            onClick={() => setUsersValue(usersValue + 1)}
                            className="w-6 h-6 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100"
                          >
                            <Plus size={10} />
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            + users
                          </span>
                        </div>
                      </>
                    )}

                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {f.included ? (
                          <div className="w-5 h-5 rounded-full bg-linear-to-r from-primary-400 to-primary-500 flex items-center justify-center shrink-0 mt-0.5">
                            <CheckCircle size={11} className="text-white" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p
                            className={`text-sm ${f.included ? "font-semibold text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}
                          >
                            {f.label}
                          </p>
                          {f.included && (f as any).sub && (
                            <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">
                              {(f as any).sub}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="bg-white dark:bg-gray-900 px-6 pb-6">
                    {isCurrent ? (
                      <div
                        className="w-full py-3 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-default select-none opacity-90"
                        style={{
                          background:
                            "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                        }}
                      >
                        <CheckCircle size={15} />
                        Current Plan
                      </div>
                    ) : plan.id === "enterprise" ? (
                      <a
                        href="mailto:sales@storeit.app?subject=Enterprise Plan Inquiry"
                        className="w-full py-3 text-white font-bold text-sm rounded-xl transition-all hover:opacity-90 flex items-center justify-center"
                        style={{
                          background:
                            "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                        }}
                      >
                        CONTACT SALES
                      </a>
                    ) : hasActiveSub ? (
                      <button
                        onClick={() => portal.mutate()}
                        disabled={portal.isPending}
                        className="w-full py-3 font-bold text-sm rounded-xl border-2 border-primary-400 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all disabled:opacity-50"
                      >
                        {portal.isPending ? "Opening…" : "SWITCH PLAN"}
                      </button>
                    ) : (
                      <button
                        onClick={() => checkout.mutate(plan.id)}
                        disabled={checkout.isPending}
                        className="w-full py-3 text-white font-bold text-sm rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
                        style={{
                          background:
                            "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                        }}
                      >
                        {pendingPlan === plan.id ? "Loading…" : "SUBSCRIBE"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}{" "}
        {/* end isLoading ternary */}
      </div>
    </AppShell>
  );
}
