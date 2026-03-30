import crypto from "crypto";
import { Router, Response, Request } from "express";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { getPlanLimits, RAZORPAY_PLAN_IDS } from "../utils/plans";

const router = Router();

const APP_URL =
  process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const BILLING_MOCK_MODE = process.env.BILLING_MOCK_MODE === "true";

type SupportedPlan = "starter" | "pro" | "enterprise";

interface RazorpaySubscription {
  id: string;
  status: string;
  customer_id?: string | null;
  plan_id?: string | null;
  charge_at?: number | null;
  current_end?: number | null;
  notes?: Record<string, string>;
}

function getMockSubscriptionId(tenantId: string, plan: string) {
  return `mock_sub_${tenantId}_${plan}`;
}

function ensureRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured");
  }

  return { keyId, keySecret };
}

async function razorpayRequest<T>(
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<T> {
  const { keyId, keySecret } = ensureRazorpayConfig();
  const response = await fetch(`${RAZORPAY_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Razorpay request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizePlan(plan: unknown): SupportedPlan | null {
  if (plan === "starter" || plan === "pro" || plan === "enterprise") {
    return plan;
  }
  return null;
}

function derivePlanFromSubscription(
  subscription: Pick<RazorpaySubscription, "notes" | "plan_id">,
): SupportedPlan | null {
  const notePlan = normalizePlan(subscription.notes?.plan);
  if (notePlan) return notePlan;

  const matched = Object.entries(RAZORPAY_PLAN_IDS).find(
    ([, planId]) => planId && planId === subscription.plan_id,
  );
  return normalizePlan(matched?.[0]);
}

function getSubscriptionEndDate(subscription: RazorpaySubscription | null) {
  const unixTime =
    subscription?.current_end ?? subscription?.charge_at ?? null;
  return unixTime ? new Date(unixTime * 1000) : null;
}

function verifySignature(payload: string, signature: string, secret: string) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (expected.length !== signature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(signature, "utf8"),
  );
}

async function fetchSubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${subscriptionId}`);
}

async function cancelSubscriptionNow(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    },
  );
}

router.get(
  "/status",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN", "MANAGER"),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: {
          id: true,
          name: true,
          plan: true,
          razorpayCustomerId: true,
          razorpaySubscriptionId: true,
          razorpayPlanId: true,
        },
      });

      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      const [storageResult, userCount] = await Promise.all([
        prisma.file.aggregate({
          where: { tenantId: req.user!.tenantId, isDeleted: false },
          _sum: { size: true },
        }),
        prisma.user.count({
          where: { tenantId: req.user!.tenantId, isActive: true },
        }),
      ]);

      let subscription: RazorpaySubscription | null = null;
      if (!BILLING_MOCK_MODE && tenant.razorpaySubscriptionId) {
        try {
          subscription = await fetchSubscription(tenant.razorpaySubscriptionId);
        } catch {
          subscription = null;
        }
      }

      const limits = getPlanLimits(tenant.plan);
      const storageBytes = storageResult._sum.size ?? 0;

      res.json({
        plan: tenant.plan,
        limits: {
          storageBytes:
            limits.storageBytes === Infinity ? null : limits.storageBytes,
          maxUsers: limits.maxUsers === Infinity ? null : limits.maxUsers,
        },
        usage: { storageBytes, users: userCount },
        billing: {
          provider: BILLING_MOCK_MODE ? "mock" : "razorpay",
          customerId: BILLING_MOCK_MODE ? null : tenant.razorpayCustomerId,
          subscriptionId:
            BILLING_MOCK_MODE && tenant.plan !== "free"
              ? getMockSubscriptionId(tenant.id, tenant.plan)
              : tenant.razorpaySubscriptionId,
          planId: BILLING_MOCK_MODE ? null : tenant.razorpayPlanId,
          subscriptionStatus: BILLING_MOCK_MODE
            ? tenant.plan === "free"
              ? null
              : "active"
            : subscription?.status ?? null,
          currentPeriodEnd: BILLING_MOCK_MODE
            ? null
            : getSubscriptionEndDate(subscription),
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch billing status" });
    }
  },
);

router.post(
  "/checkout",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = normalizePlan(req.body?.plan);
      if (!plan) {
        res.status(400).json({ error: "Invalid plan" });
        return;
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: {
          id: true,
          name: true,
          plan: true,
          razorpaySubscriptionId: true,
        },
      });

      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      if (BILLING_MOCK_MODE) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            plan,
            razorpayCustomerId: null,
            razorpaySubscriptionId: null,
            razorpayPlanId: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
        });

        res.json({
          mock: true,
          provider: "mock",
          subscriptionId: getMockSubscriptionId(tenant.id, plan),
          key: "mock",
          name: "StoreIT",
          description: `${plan.toUpperCase()} plan subscription`,
        });
        return;
      }

      const planId = RAZORPAY_PLAN_IDS[plan];
      if (!planId) {
        res.status(400).json({
          error: `Razorpay plan ID is not configured for the ${plan} plan.`,
        });
        return;
      }

      if (tenant.plan === plan && tenant.razorpaySubscriptionId) {
        try {
          const currentSubscription = await fetchSubscription(
            tenant.razorpaySubscriptionId,
          );
          if (
            !["cancelled", "completed", "expired"].includes(
              currentSubscription.status,
            )
          ) {
            res.status(400).json({ error: "You are already on this plan." });
            return;
          }
        } catch {
          // If the old subscription no longer exists, allow a fresh checkout.
        }
      }

      const subscription = await razorpayRequest<RazorpaySubscription>(
        "/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({
            plan_id: planId,
            total_count: 1200,
            quantity: 1,
            customer_notify: 1,
            notes: {
              tenantId: tenant.id,
              plan,
              replacedSubscriptionId: tenant.razorpaySubscriptionId ?? "",
            },
          }),
        },
      );

      const { keyId } = ensureRazorpayConfig();

      res.json({
        subscriptionId: subscription.id,
        key: keyId,
        name: "StoreIT",
        description: `${plan.toUpperCase()} plan subscription`,
        callbackUrl: `${APP_URL}/billing`,
        prefill: {
          name: tenant.name,
          email: req.user!.email,
        },
        notes: {
          tenantId: tenant.id,
          plan,
        },
        theme: {
          color: "#ec4899",
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start Razorpay checkout" });
    }
  },
);

router.post(
  "/verify",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const razorpayPaymentId = req.body?.razorpayPaymentId;
      const razorpaySubscriptionId = req.body?.razorpaySubscriptionId;
      const razorpaySignature = req.body?.razorpaySignature;
      const requestedPlan = normalizePlan(req.body?.plan);

      if (
        !requestedPlan
      ) {
        res.status(400).json({ error: "Missing checkout verification details" });
        return;
      }

      if (BILLING_MOCK_MODE) {
        await prisma.tenant.update({
          where: { id: req.user!.tenantId },
          data: {
            plan: requestedPlan,
            razorpayCustomerId: null,
            razorpaySubscriptionId: null,
            razorpayPlanId: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
        });

        res.json({
          mock: true,
          plan: requestedPlan,
          subscriptionId: getMockSubscriptionId(req.user!.tenantId, requestedPlan),
          subscriptionStatus: "active",
        });
        return;
      }

      if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
        res.status(400).json({ error: "Missing checkout verification details" });
        return;
      }

      const { keySecret } = ensureRazorpayConfig();
      const signatureOk = verifySignature(
        `${razorpayPaymentId}|${razorpaySubscriptionId}`,
        razorpaySignature,
        keySecret,
      );

      if (!signatureOk) {
        res.status(400).json({ error: "Invalid Razorpay signature" });
        return;
      }

      const subscription = await fetchSubscription(razorpaySubscriptionId);
      const tenantId = subscription.notes?.tenantId;
      const subscriptionPlan =
        requestedPlan ?? derivePlanFromSubscription(subscription);

      if (!tenantId || !subscriptionPlan) {
        res.status(400).json({ error: "Subscription metadata is incomplete" });
        return;
      }

      if (tenantId !== req.user!.tenantId) {
        res
          .status(403)
          .json({ error: "This checkout does not belong to your organisation" });
        return;
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          razorpaySubscriptionId: true,
        },
      });

      const previousSubscriptionId =
        subscription.notes?.replacedSubscriptionId ||
        tenant?.razorpaySubscriptionId ||
        null;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan: subscriptionPlan,
          razorpayCustomerId: subscription.customer_id ?? null,
          razorpaySubscriptionId,
          razorpayPlanId:
            subscription.plan_id ?? RAZORPAY_PLAN_IDS[subscriptionPlan] ?? null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      });

      if (
        previousSubscriptionId &&
        previousSubscriptionId !== razorpaySubscriptionId
      ) {
        try {
          await cancelSubscriptionNow(previousSubscriptionId);
        } catch (cancelErr) {
          console.error(
            `Failed to cancel previous Razorpay subscription ${previousSubscriptionId}:`,
            cancelErr,
          );
        }
      }

      res.json({
        plan: subscriptionPlan,
        subscriptionId: razorpaySubscriptionId,
        subscriptionStatus: subscription.status,
      });
    } catch (err) {
      console.error("Verify error:", err);
      res.status(500).json({ error: "Failed to verify Razorpay checkout" });
    }
  },
);

router.post(
  "/cancel",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: {
          id: true,
          plan: true,
          razorpaySubscriptionId: true,
        },
      });

      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      if (BILLING_MOCK_MODE) {
        if (tenant.plan === "free") {
          res.status(400).json({ error: "No active subscription found." });
          return;
        }

        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            plan: "free",
            razorpayCustomerId: null,
            razorpaySubscriptionId: null,
            razorpayPlanId: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
        });

        res.json({
          cancelled: true,
          subscriptionId: getMockSubscriptionId(tenant.id, "free"),
        });
        return;
      }

      if (!tenant.razorpaySubscriptionId) {
        res.status(400).json({ error: "No active subscription found." });
        return;
      }

      const subscription = await cancelSubscriptionNow(
        tenant.razorpaySubscriptionId,
      );

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          plan: "free",
          razorpayCustomerId: null,
          razorpaySubscriptionId: null,
          razorpayPlanId: null,
        },
      });

      res.json({
        cancelled: true,
        subscriptionId: subscription.id,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  },
);

router.post(
  "/portal",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (_req: AuthRequest, res: Response) => {
    res.status(400).json({
      error:
        "Razorpay does not use the old billing portal flow here. Use the billing page to change or cancel the subscription.",
    });
  },
);

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!webhookSecret || typeof signature !== "string") {
      res.status(400).json({ error: "Missing webhook signature or secret" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");

    if (!verifySignature(rawBody.toString("utf8"), signature, webhookSecret)) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    const event = JSON.parse(rawBody.toString("utf8")) as {
      event?: string;
      payload?: {
        subscription?: {
          entity?: RazorpaySubscription;
        };
      };
    };

    const subscription = event.payload?.subscription?.entity;
    if (!subscription) {
      res.json({ received: true });
      return;
    }

    const tenantId = subscription.notes?.tenantId;
    const plan = derivePlanFromSubscription(subscription);

    if (!tenantId) {
      res.json({ received: true });
      return;
    }

    if (
      [
        "subscription.authenticated",
        "subscription.activated",
        "subscription.charged",
      ].includes(event.event ?? "") &&
      plan
    ) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan,
          razorpayCustomerId: subscription.customer_id ?? null,
          razorpaySubscriptionId: subscription.id,
          razorpayPlanId:
            subscription.plan_id ?? RAZORPAY_PLAN_IDS[plan] ?? null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      });
    }

    if (
      [
        "subscription.cancelled",
        "subscription.completed",
        "subscription.halted",
        "subscription.expired",
      ].includes(event.event ?? "")
    ) {
      await prisma.tenant.updateMany({
        where: {
          id: tenantId,
          razorpaySubscriptionId: subscription.id,
        },
        data: {
          plan: "free",
          razorpayCustomerId: null,
          razorpaySubscriptionId: null,
          razorpayPlanId: null,
        },
      });
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

export default router;
