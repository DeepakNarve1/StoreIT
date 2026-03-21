import { Router, Response, Request } from "express";
import Stripe from "stripe";
import { verifyAuth, AuthRequest, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { getPlanLimits, STRIPE_PRICE_IDS } from "../utils/plans";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
});

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// ─── GET /api/billing/status ──────────────────────────────────────────────────
// Returns current plan, usage, and Stripe subscription status
router.get(
  "/status",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: {
          id: true,
          name: true,
          plan: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
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

      const limits = getPlanLimits(tenant.plan);
      const storageBytes = storageResult._sum.size ?? 0;

      // Fetch subscription status from Stripe if available
      let subscriptionStatus = null;
      let currentPeriodEnd = null;
      if (tenant.stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            tenant.stripeSubscriptionId,
          );
          subscriptionStatus = sub.status;
          currentPeriodEnd = new Date(sub.current_period_end * 1000);
        } catch {
          // subscription may have been deleted in Stripe
        }
      }

      res.json({
        plan: tenant.plan,
        limits: {
          storageBytes:
            limits.storageBytes === Infinity ? null : limits.storageBytes,
          maxUsers: limits.maxUsers === Infinity ? null : limits.maxUsers,
        },
        usage: { storageBytes, users: userCount },
        stripe: {
          customerId: tenant.stripeCustomerId,
          subscriptionId: tenant.stripeSubscriptionId,
          subscriptionStatus,
          currentPeriodEnd,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch billing status" });
    }
  },
);

// ─── POST /api/billing/checkout ───────────────────────────────────────────────
// Creates a Stripe checkout session for upgrading to a plan
router.post(
  "/checkout",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { plan } = req.body;

      if (!["starter", "pro", "enterprise"].includes(plan)) {
        res.status(400).json({ error: "Invalid plan" });
        return;
      }

      const priceId = STRIPE_PRICE_IDS[plan];
      if (!priceId) {
        res
          .status(400)
          .json({ error: `Stripe price ID not configured for ${plan} plan` });
        return;
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { id: true, name: true, stripeCustomerId: true },
      });

      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      // Reuse existing Stripe customer or create new one
      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: tenant.name,
          email: req.user!.email,
          metadata: { tenantId: tenant.id },
        });
        customerId = customer.id;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { stripeCustomerId: customerId },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${APP_URL}/billing?success=true`,
        cancel_url: `${APP_URL}/billing?canceled=true`,
        metadata: { tenantId: tenant.id, plan },
        subscription_data: {
          metadata: { tenantId: tenant.id, plan },
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  },
);

// ─── POST /api/billing/portal ─────────────────────────────────────────────────
// Creates a Stripe billing portal session (manage/cancel/invoices)
router.post(
  "/portal",
  verifyAuth,
  requireRole("ORG_ADMIN", "SUPERADMIN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { stripeCustomerId: true },
      });

      if (!tenant?.stripeCustomerId) {
        res
          .status(400)
          .json({ error: "No billing account found. Please subscribe first." });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: `${APP_URL}/billing`,
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to open billing portal" });
    }
  },
);

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// Stripe sends events here — updates plan in DB automatically
router.post(
  "/webhook",
  // Raw body needed for Stripe signature verification
  (req: Request, res: Response, next) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      (req as any).rawBody = data;
      next();
    });
  },
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      res.status(400).json({ error: "Missing signature or webhook secret" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        (req as any).rawBody,
        sig,
        webhookSecret,
      );
    } catch (err: any) {
      console.error("Webhook signature error:", err.message);
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const tenantId = session.metadata?.tenantId;
          const plan = session.metadata?.plan;

          if (tenantId && plan) {
            await prisma.tenant.update({
              where: { id: tenantId },
              data: {
                plan,
                stripeSubscriptionId: session.subscription as string,
              },
            });
            console.log(`✅ Tenant ${tenantId} upgraded to ${plan}`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const tenantId = sub.metadata?.tenantId;
          const plan = sub.metadata?.plan;

          if (tenantId && plan) {
            await prisma.tenant.update({
              where: { id: tenantId },
              data: { plan },
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const tenantId = sub.metadata?.tenantId;

          if (tenantId) {
            await prisma.tenant.update({
              where: { id: tenantId },
              data: { plan: "free", stripeSubscriptionId: null },
            });
            console.log(
              `⚠️  Tenant ${tenantId} downgraded to free (subscription cancelled)`,
            );
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          console.error(`❌ Payment failed for customer ${invoice.customer}`);
          // TODO: send email notification to org admin
          break;
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook handler error:", err);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  },
);

export default router;
