export const PLAN_LIMITS = {
  free: { storageBytes: 1 * 1024 ** 3, maxUsers: 3, price: 0 },
  starter: { storageBytes: 10 * 1024 ** 3, maxUsers: 10, price: 2700 }, // $27/mo in cents
  pro: { storageBytes: 100 * 1024 ** 3, maxUsers: 50, price: 7900 }, // $79/mo
  enterprise: { storageBytes: Infinity, maxUsers: Infinity, price: 0 },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}

// Map plan name → Stripe Price ID
// You'll create these in Stripe dashboard and paste the IDs here
export const STRIPE_PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
};
