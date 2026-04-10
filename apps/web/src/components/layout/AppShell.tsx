import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import api from "../../api/axios";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status-banner"],
    queryFn: async () => {
      try {
        const res = await api.get("/billing/status");
        return res.data as {
          plan?: string;
          effectivePlan?: string;
          isInGracePeriod?: boolean;
          isOverStorageQuota?: boolean;
          isUserLimitReached?: boolean;
          limits?: {
            storageBytes?: number | null;
            maxUsers?: number | null;
          };
          usage?: {
            storageBytes?: number;
            users?: number;
          };
        };
      } catch {
        // Non-admin roles may not access billing status; hide banner in that case.
        return null;
      }
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const showPolicyBanner =
    !!billingStatus &&
    (billingStatus.isOverStorageQuota ||
      billingStatus.isUserLimitReached ||
      billingStatus.isInGracePeriod);

  // Auto-close sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <div
        className={`
        fixed md:static inset-y-0 left-0 z-30 transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        ${!sidebarOpen ? "md:w-0 md:overflow-hidden" : ""}
      `}
      >
        <Sidebar isOpen={sidebarOpen} />
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          sidebarOpen={sidebarOpen}
        />
        {showPolicyBanner ? (
          <div className="px-4 md:px-6 pt-3">
            <div className="rounded-xl border border-amber-300/70 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              {billingStatus?.isOverStorageQuota ? (
                <p>
                  Storage quota exceeded on the{" "}
                  <span className="font-semibold">
                    {billingStatus.effectivePlan ?? billingStatus.plan ?? "free"}
                  </span>{" "}
                  plan. Uploads and new versions are blocked until you delete files
                  or upgrade.
                </p>
              ) : null}
              {billingStatus?.isUserLimitReached ? (
                <p className={billingStatus?.isOverStorageQuota ? "mt-1.5" : ""}>
                  User seat limit reached. New invites and reactivations are blocked
                  until seats are freed or your plan is upgraded.
                </p>
              ) : null}
              {billingStatus?.isInGracePeriod ? (
                <p
                  className={
                    billingStatus?.isOverStorageQuota ||
                    billingStatus?.isUserLimitReached
                      ? "mt-1.5"
                      : ""
                  }
                >
                  Subscription grace period is active. If payment is not restored,
                  limits will fall back to the free plan.
                </p>
              ) : null}
              <div className="mt-2">
                <button
                  onClick={() => navigate("/billing")}
                  className="text-xs font-semibold underline underline-offset-2 hover:opacity-90"
                >
                  Open Billing
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
