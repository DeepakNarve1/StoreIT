# StoreIT — Document Management SaaS

![StoreIT Banner](https://via.placeholder.com/1200x300?text=StoreIT+-+Secure+Enterprise+Document+Management)

StoreIT is a modern, full-stack, multi-tenant Document Management SaaS designed for businesses to securely store, organize, share, and track files. It utilizes a robust Monorepo architecture to seamlessly link a high-performance React frontend with an unshakeable Node.js API backend.

## 🚀 Tech Stack

*   **Frontend (`apps/web`):** React 19, Vite, TailwindCSS 4, React Query (TanStack), Zustand, Lucide-React.
*   **Backend (`apps/api`):** Node.js, Express, TypeScript, Prisma ORM, JSON Web Tokens (JWT), Zod Validation.
*   **Database:** PostgreSQL (with explicit strict typing for all relational modeling).
*   **Infrastructure Integrations:** AWS S3 / Cloudflare R2 (for Blob Storage), Stripe (for recurring Billing), Resend (for secure Email invites).
*   **Architecture:** Turborepo natively supporting cross-domain local development and seamless Vercel/Render deployments.

---

## 🏗 Workflow & Core Features

StoreIT is structurally isolated by **Tenants (Organizations)**. Every user belongs to a specific Tenant and has a strictly defined Role.

1.  **Multi-Tenant Architecture:** Data is strictly isolated by `tenantId`. A user in Acme Corp cannot query any data from Global Corp, enforced natively at the Prisma route level.
2.  **Superadmin Portal:** A hidden tier accessed by accounts flagged as `SUPERADMIN`. It enables overarching views of all Organizations, usage stats, and manual Stripe Subscription overrides.
3.  **File & Folder System:** Materialized path indexing allows rapid, nested folder structures. Files support Versioning natively, tracking `v1`, `v2`, etc., along with who generated the version.
4.  **Security & One-Time Links:** Users can generate secure, expiring One-Time Links that allow outsiders strictly monitored, read-only access to specific files.
5.  **Audit Logs:** Critical compliance tracking. Every important action (`file.upload`, `user.login`, `permission.grant`) is immutably logged and visibly tracked in the Dashboard.

---

## 🔐 The Permission System (For Developers)

StoreIT uses a hybrid Role-Based Access Control (RBAC) and Granular Capability system. This is crucial for developers modifying or creating new protected routes.

### 1. Macro Roles (`Role` Enum)
Every user holds a single fundamental role mapping to their application power:
*   `SUPERADMIN`: Exists outside tenants. Complete platform control.
*   `ORG_ADMIN`: Complete control over their assigned Tenant. Can manage billing and users.
*   `MANAGER`: Can manage departments, team permissions, and view audit logs. Cannot touch billing.
*   `EDITOR`: Can upload, edit, move, and share files. Cannot alter high-level folder structures arbitrarily.
*   `VIEWER`: Strictly read-only access. Can download and preview.

**How to implement Macro Roles in routes:**
Use the predefined middleware `requireRole` found in `apps/api/src/middleware/auth.ts`:
```typescript
import { verifyAuth, requireRole } from "../middleware/auth";

// Only ORG_ADMIN and MANAGER can access this route
router.post("/departments", verifyAuth, requireRole(["ORG_ADMIN", "MANAGER"]), async (req, res) => {
   // Execute logic
});
```

### 2. Granular Permissions (`Permission` Table)
While Macro roles dictate standard limits, the `Permission` schema dictates *hyper-specific overrides* for individual Files, Folders, or Departments.
When a developer builds a feature that requires selective access (e.g., "Only User A and Department B can view this secure folder"):

1. The developer inserts a record into the `Permission` table linking the specific `resourceId` (the folder) to the `grantedTo` entity (User A).
2. The `capabilities` JSON column dictates exactly what they can do (e.g., `{ "see_metadata": true, "delete": false }`).

**How to add a new granular permission feature:**
1. Open `apps/web/src/pages/admin/PermissionsOverviewPage.tsx` to add UI controls for your new JSON capability.
2. Modify the target resource route inside `apps/api/src/routes/*.ts` to run a database check for the users specific ID matching the required capability in the `Permission` table *before* executing the action.

---

## 🛠 Local Development Guide

### 1. Environment Setup
You need two `.env` files copied from their respective `.env.example`s:
*   Root directory: `/.env` (Contains your `DATABASE_URL` and `JWT_SECRET`)
*   Web directory: `/apps/web/.env` (Contains your `VITE_API_URL`, e.g., `http://localhost:5000/api`)

### 2. Database Migration & Seeding
Start by instantiating the database schema and generating the Prisma Client:
```bash
npm install
npx prisma generate
npx prisma migrate dev
```

Next, run the seed script to natively inject the default `SUPERADMIN` and `Acme Corp` test accounts:
```bash
npm run db:seed
```

### 3. Startup
Because the project is structured with Turnborepo, simply run:
```bash
npm run dev
```
This single command spins up the Vite Frontend on `http://localhost:5173` and the Express Backend on `http://localhost:5000` simultaneously.

---

## 🚀 Deployment (Vercel + Render)

StoreIT is configured to be deployed strictly on Edge/Containerized hosting to maximize scalability without the pitfalls of Serverless backend cold-starts.

1.  **Database (PostgreSQL):** Deploy on Render, Neon, or Supabase.
2.  **API Backend (Render):**
    *   Connect your GitHub repository as a "Web Service".
    *   Build Command: `npm install && npx prisma generate && npm run build --workspace=apps/api`
    *   Start Command: `cd apps/api && npm start`
    *   *Note: Ensure `FRONTEND_URL` is set strictly to your Vercel URL with no trailing slash.*
3.  **React Frontend (Vercel):**
    *   Connect your GitHub repository.
    *   Framework Preset: `Vite`
    *   Root Directory: `apps/web`
    *   *Note: Add `VITE_API_URL` pointing strictly to your Render API address (e.g., `https://your-api.onrender.com/api`).*

---

## 🛡 Security & Hardening Features built-in
*   **Central Error Handling:** Errors are routed through `errorHandler.ts` to ensure stack traces never leak into production environments in JSON responses.
*   **Failsafe UUID Casting:** All dynamic parameterized endpoints (`/:id`) check against a robust `Zod.uuid()` validation guard. Malicious or badly cast injections instantly return `400 Bad Request` before ever touching the Prisma query execution layer.
*   **Instant Billing Sync:** Stripe checkouts hit a strict verification `/api/billing/verify` endpoint immediately upon redirect, neutralizing issues tied to webhook network delays and ensuring instant UI scaling upon upgrade.
