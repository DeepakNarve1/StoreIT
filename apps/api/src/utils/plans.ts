export const PLAN_LIMITS = {
  free: { storageBytes: 1 * 1024 ** 3, maxUsers: 3, price: 0 },
  starter: { storageBytes: 150 * 1024 ** 3, maxUsers: 5, price: 400000 }, // Rs 4000 in paise
  pro: { storageBytes: 500 * 1024 ** 3, maxUsers: 10, price: 921100 }, // Rs 9211
  enterprise: { storageBytes: Infinity, maxUsers: Infinity, price: 0 },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}

// Map plan name → Stripe Price ID
// Keys must match the plan IDs used in checkout and the names in .env
export const STRIPE_PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_MINI ?? "",
  pro: process.env.STRIPE_PRICE_MEDIUM ?? "",
  enterprise: process.env.STRIPE_PRICE_TAILOR ?? "",
};
