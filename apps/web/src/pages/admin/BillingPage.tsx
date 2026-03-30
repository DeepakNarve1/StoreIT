import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  AlertTriangle,
  Users,
  HardDrive,
  Minus,
  Plus,
  CreditCard,
  CalendarDays,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import axios from "axios";
import AppShell from "../../components/layout/AppShell";
import { useToast } from "../../components/ui/toastStore";
import api from "../../api/axios";

function axiosErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const d = err.response?.data;
  if (d && typeof d === "object" && d !== null && "error" in d) {
    const e = (d as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

interface PlanFeature {
  label: string;
  included: boolean;
  sub?: string;
}

interface BillingPlan {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price: number | null;
  priceLabel: string | null;
  storage: string;
  users: number;
  customizable?: boolean;
  features: PlanFeature[];
}

const PLANS: BillingPlan[] = [
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

function loadRazorpayCheckoutScript() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const [tbValue, setTbValue] = useState(0.5);
  const [usersValue, setUsersValue] = useState(20);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["billing-status"],
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get("/billing/status");
      return res.data as {
        plan: string;
        limits: { storageBytes: number | null; maxUsers: number | null };
        usage: { storageBytes: number; users: number };
        billing: {
          provider: string;
          subscriptionId: string | null;
          subscriptionStatus: string | null;
          currentPeriodEnd: string | null;
        };
      };
    },
  });

  const verifyCheckout = useMutation({
    mutationFn: async ({
      plan,
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    }: {
      plan: string;
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }) => {
      const res = await api.post("/billing/verify", {
        plan,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySubscriptionId: razorpay_subscription_id,
        razorpaySignature: razorpay_signature,
      });
      return res.data;
    },
    onSuccess: () => {
      setPendingPlan(null);
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      useToast.getState().add("Subscription updated successfully.", "success");
    },
    onError: (err: unknown) => {
      setPendingPlan(null);
      useToast
        .getState()
        .add(
          axiosErrorMessage(err, "Failed to verify the Razorpay payment."),
          "error",
        );
    },
  });

  const checkout = useMutation({
    mutationFn: async (plan: string) => {
      const res = await api.post("/billing/checkout", { plan });
      return res.data as {
        mock?: boolean;
        provider?: string;
        subscriptionId: string;
        key: string;
        name: string;
        description: string;
        prefill?: { name?: string; email?: string };
        notes?: Record<string, string>;
        theme?: { color?: string };
      };
    },
    onMutate: (plan) => setPendingPlan(plan),
    onSuccess: async (checkoutData, plan) => {
      if (checkoutData.mock) {
        setPendingPlan(null);
        queryClient.invalidateQueries({ queryKey: ["billing-status"] });
        useToast
          .getState()
          .add("Mock subscription updated successfully.", "success");
        return;
      }

      const scriptLoaded = await loadRazorpayCheckoutScript();
      if (!scriptLoaded || !window.Razorpay) {
        setPendingPlan(null);
        useToast
          .getState()
          .add("Failed to load Razorpay Checkout.", "error");
        return;
      }

      const razorpay = new window.Razorpay({
        key: checkoutData.key,
        subscription_id: checkoutData.subscriptionId,
        name: checkoutData.name,
        description: checkoutData.description,
        prefill: checkoutData.prefill,
        notes: checkoutData.notes,
        theme: checkoutData.theme,
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          verifyCheckout.mutate({ plan, ...response });
        },
        modal: {
          ondismiss: () => {
            setPendingPlan(null);
          },
        },
      });

      razorpay.open();
    },
    onError: (err: unknown) => {
      setPendingPlan(null);
      useToast
        .getState()
        .add(
          axiosErrorMessage(err, "Failed to start Razorpay checkout."),
          "error",
        );
    },
  });

  const cancelSubscription = useMutation({
    mutationFn: async () => {
      const res = await api.post("/billing/cancel");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      useToast.getState().add("Subscription cancelled.", "success");
    },
    onError: (err: unknown) => {
      useToast
        .getState()
        .add(axiosErrorMessage(err, "Failed to cancel subscription."), "error");
    },
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
  const hasActiveSubscription =
    !!data?.billing.subscriptionId &&
    !["cancelled", "completed", "expired"].includes(
      data?.billing.subscriptionStatus ?? "",
    );

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-0">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Billing &amp; Plans
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Manage your subscription and usage with Razorpay.
          </p>
        </div>

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
            const renewalDate = data.billing.currentPeriodEnd
              ? new Date(data.billing.currentPeriodEnd).toLocaleDateString(
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
                className="mb-6 flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between"
                style={{
                  background:
                    "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                      Your current plan
                    </p>
                    <p className="text-2xl font-black leading-tight text-white">
                      {planLabel}
                    </p>
                    {data.billing.subscriptionStatus && (
                      <p className="mt-1 text-xs uppercase tracking-wide text-white/80">
                        Status: {data.billing.subscriptionStatus}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  {renewalDate && (
                    <span className="flex items-center gap-1.5 text-xs text-white/80">
                      <CalendarDays size={12} />
                      Renews {renewalDate}
                    </span>
                  )}
                  {hasActiveSubscription && (
                    <button
                      onClick={() => cancelSubscription.mutate()}
                      disabled={cancelSubscription.isPending}
                      className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/30 disabled:opacity-50"
                    >
                      <XCircle size={12} />
                      {cancelSubscription.isPending
                        ? "Cancelling..."
                        : "Cancel subscription"}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        {hasActiveSubscription && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <RefreshCw size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Changing plans will start a new Razorpay subscription and replace
              the current one after payment confirmation.
            </p>
          </div>
        )}

        {!isLoading && data && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <p className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Current usage
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <HardDrive size={12} /> Storage
                  </span>
                  <span>
                    {formatBytes(storageUsed)} /{" "}
                    {storageLimit ? formatBytes(storageLimit) : "∞"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full transition-all ${storagePct >= 90 ? "bg-red-500" : "bg-primary-500"}`}
                    style={{ width: `${storagePct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> Users
                  </span>
                  <span>
                    {usersUsed} / {usersLimit ?? "∞"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full transition-all ${usersPct >= 90 ? "bg-red-500" : "bg-primary-500"}`}
                    style={{ width: `${usersPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border-2 border-gray-200 animate-pulse dark:border-gray-700"
              >
                <div className="h-36 bg-gray-100 dark:bg-gray-800" />
                <div className="space-y-3 p-6">
                  {[...Array(5)].map((_, j) => (
                    <div
                      key={j}
                      className="h-4 w-full rounded bg-gray-100 dark:bg-gray-800"
                    />
                  ))}
                </div>
                <div className="px-6 pb-6">
                  <div className="h-11 rounded-xl bg-gray-100 dark:bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const isBusy =
                pendingPlan === plan.id ||
                checkout.isPending ||
                verifyCheckout.isPending;

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col overflow-hidden rounded-2xl border-2 transition-all ${
                    isCurrent
                      ? "border-primary-500"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="border-b-2 border-gray-200 bg-linear-to-br from-primary-50 to-primary-100 px-6 py-5 text-center dark:border-gray-700 dark:from-gray-800 dark:to-gray-800">
                    <p className="mb-2 text-sm font-bold tracking-widest text-gray-600 dark:text-gray-400">
                      {plan.name}
                    </p>
                    {plan.priceLabel ? (
                      <p className="py-3 text-2xl font-black leading-none text-gray-900 dark:text-white">
                        {plan.priceLabel}
                      </p>
                    ) : plan.price !== null ? (
                      <div className="flex items-end justify-center gap-1">
                        <span className="mb-1 text-xl font-bold text-primary-500">
                          Rs
                        </span>
                        <span className="text-5xl font-black leading-none text-gray-900 dark:text-white">
                          {plan.price.toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                    {plan.price !== null && !plan.priceLabel && (
                      <p className="mt-2 text-xs text-gray-500">
                        + taxes
                        <br />
                        Monthly
                      </p>
                    )}
                    {isCurrent && (
                      <span className="mt-2 inline-block rounded-full bg-linear-to-r from-primary-400 to-primary-500 px-3 py-1 text-xs font-semibold text-white">
                        Current Plan
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-3 bg-white px-6 py-5 dark:bg-gray-900">
                    {plan.customizable && (
                      <>
                        <div className="mb-1 flex items-center gap-2">
                          <button
                            onClick={() =>
                              setTbValue(Math.max(0.5, tbValue - 0.5))
                            }
                            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {tbValue}
                          </span>
                          <button
                            onClick={() => setTbValue(tbValue + 0.5)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                          >
                            <Plus size={10} />
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            + <strong>TB</strong> storage
                          </span>
                        </div>
                        <div className="mb-2 flex items-center gap-2">
                          <button
                            onClick={() =>
                              setUsersValue(Math.max(1, usersValue - 1))
                            }
                            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {usersValue}
                          </span>
                          <button
                            onClick={() => setUsersValue(usersValue + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 text-gray-500 hover:bg-gray-100"
                          >
                            <Plus size={10} />
                          </button>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            + users
                          </span>
                        </div>
                      </>
                    )}

                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        {feature.included ? (
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-to-r from-primary-400 to-primary-500">
                            <CheckCircle size={11} className="text-white" />
                          </div>
                        ) : (
                          <div className="mt-0.5 h-5 w-5 shrink-0" />
                        )}
                        <div>
                          <p
                            className={`text-sm ${
                              feature.included
                                ? "font-semibold text-gray-800 dark:text-gray-200"
                                : "text-gray-400 dark:text-gray-500"
                            }`}
                          >
                            {feature.label}
                          </p>
                          {feature.included && feature.sub && (
                            <p className="mt-0.5 whitespace-pre-line text-xs text-gray-400">
                              {feature.sub}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white px-6 pb-6 dark:bg-gray-900">
                    {isCurrent ? (
                      <div
                        className="flex w-full cursor-default select-none items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white opacity-90"
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
                        className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold text-white transition-all hover:opacity-90"
                        style={{
                          background:
                            "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                        }}
                      >
                        CONTACT SALES
                      </a>
                    ) : (
                      <button
                        onClick={() => checkout.mutate(plan.id)}
                        disabled={isBusy}
                        className={`w-full rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-50 ${
                          hasActiveSubscription
                            ? "border-2 border-primary-400 text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                            : "text-white hover:opacity-90"
                        }`}
                        style={
                          hasActiveSubscription
                            ? undefined
                            : {
                                background:
                                  "linear-gradient(135deg, #ff8a80 0%, #f06292 100%)",
                              }
                        }
                      >
                        {isBusy
                          ? "Opening..."
                          : hasActiveSubscription
                            ? "CHANGE PLAN"
                            : "SUBSCRIBE"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data?.billing.provider === "mock" && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-600"
            />
            <p className="text-sm text-amber-800">
              Billing mock mode is enabled. Plan changes here update StoreIT
              locally without opening Razorpay Checkout.
            </p>
          </div>
        )}

        {!hasActiveSubscription && currentPlan === "free" && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-blue-600" />
            <p className="text-sm text-blue-800">
              Paid plans now open inside Razorpay Checkout. Once payment is
              confirmed, your plan updates immediately in StoreIT.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
