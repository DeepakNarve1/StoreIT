import { prisma } from "../utils/prisma";
import { getPlanLimits } from "../utils/plans";

export function resolveEffectivePlan(
  plan: string | null | undefined,
  planExpiresAt: Date | null | undefined,
): string {
  if (planExpiresAt && planExpiresAt < new Date()) {
    return "free";
  }
  return plan ?? "free";
}

export async function getTenantPlanSnapshot(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, planExpiresAt: true },
  });

  const effectivePlan = resolveEffectivePlan(
    tenant?.plan ?? "free",
    tenant?.planExpiresAt ?? null,
  );
  const limits = getPlanLimits(effectivePlan);

  const [usageResult, activeUsers] = await Promise.all([
    prisma.file.aggregate({
      where: { tenantId, isDeleted: false },
      _sum: { size: true },
    }),
    prisma.user.count({
      where: { tenantId, isActive: true },
    }),
  ]);

  const usedBytes = usageResult._sum.size ?? 0;
  const overStorageLimit =
    limits.storageBytes !== Infinity && usedBytes > limits.storageBytes;
  const overUserLimit =
    limits.maxUsers !== Infinity && activeUsers > limits.maxUsers;

  return {
    effectivePlan,
    limits,
    usedBytes,
    activeUsers,
    overStorageLimit,
    overUserLimit,
  };
}

