// Storage limits in bytes per plan
export const PLAN_LIMITS = {
  free: { storageBytes: 1 * 1024 * 1024 * 1024, maxUsers: 3 }, // 1 GB
  starter: { storageBytes: 10 * 1024 * 1024 * 1024, maxUsers: 10 }, // 10 GB
  pro: { storageBytes: 100 * 1024 * 1024 * 1024, maxUsers: 50 }, // 100 GB
  enterprise: { storageBytes: Infinity, maxUsers: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
}
