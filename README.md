# StoreIT — Enterprise Document Management SaaS

> A modern, full-stack, multi-tenant Document Management platform built for teams who need secure, organized, and auditable access to their files.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
  - [Monorepo Layout](#monorepo-layout)
  - [System Architecture Diagram](#system-architecture-diagram)
  - [Database Schema Overview](#database-schema-overview)
  - [API Route Map](#api-route-map)
  - [Frontend Route Map](#frontend-route-map)
- [Tech Stack](#tech-stack)
- [Core Features](#core-features)
- [Permission System](#permission-system)
  - [Macro Roles (RBAC)](#macro-roles-rbac)
  - [Granular Permissions](#granular-permissions)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [1 — Clone & Install](#1--clone--install)
  - [2 — Configure Environment Variables](#2--configure-environment-variables)
  - [3 — Database Setup](#3--database-setup)
  - [4 — Run the Development Server](#4--run-the-development-server)
  - [Seed Credentials](#seed-credentials)
- [Environment Variables Reference](#environment-variables-reference)
- [Scripts Reference](#scripts-reference)
- [Deployment Guide](#deployment-guide)
  - [Database](#database)
  - [API Backend (Render)](#api-backend-render)
  - [Frontend (Vercel)](#frontend-vercel)
- [Security & Hardening](#security--hardening)
- [Third-Party Licenses](#third-party-licenses)
- [Contributing](#contributing)

---

## Overview

**StoreIT** is a production-ready, multi-tenant Document Management SaaS. Every resource — files, folders, users, audit logs — is strictly isolated by `tenantId`. The platform combines:

- A **React 19 + Vite** frontend with lazy-loaded routes, TanStack Query for server state, and Zustand for local auth state.
- A **Node.js + Express + TypeScript** API backend with Prisma ORM, full JWT authentication (access + refresh tokens), granular RBAC, and rate limiting.
- **PostgreSQL** as the primary datastore, using the Prisma PG driver adapter for connection-pool efficiency.
- **Cloudflare R2 / AWS S3** for binary blob storage with short-lived presigned URLs.
- **Stripe / Razorpay** for subscription billing.
- **SendGrid** for transactional emails (invites, password resets, signing notifications).
- **Tesseract.js + pdf-parse + sharp** for server-side OCR, text extraction, and image processing powering full-text search.

---

## Architecture

### Monorepo Layout

```
StoreIT/                        <- Workspace root (npm workspaces)
├── apps/
│   ├── api/                    <- Express/TypeScript backend
│   │   └── src/
│   │       ├── index.ts        <- App bootstrap, middleware, route mounting
│   │       ├── middleware/
│   │       │   ├── auth.ts     <- verifyAuth, requireRole, verifyCsrf
│   │       │   ├── security.ts <- MIME allowlist, signed-URL TTL constants
│   │       │   └── errorHandler.ts
│   │       ├── routes/         <- 19 Express router files (one per domain)
│   │       ├── services/       <- Business-logic layer (13 services)
│   │       └── utils/          <- prisma.ts, env.ts, seed.ts, plans.ts
│   └── web/                    <- Vite + React 19 frontend
│       └── src/
│           ├── App.tsx         <- Root router with lazy-loaded pages
│           ├── pages/
│           │   ├── admin/      <- ORG_ADMIN / MANAGER pages
│           │   └── superadmin/ <- SUPERADMIN-only pages
│           ├── components/     <- Shared UI components
│           ├── store/          <- Zustand stores (authStore, ...)
│           ├── api/            <- Axios-based API client functions
│           ├── hooks/          <- Custom React hooks
│           └── types/          <- Shared TypeScript types
├── packages/
│   └── shared/                 <- Shared schemas and TypeScript types
│       ├── schemas/            <- Zod schemas shared between apps
│       └── types/
├── prisma/
│   ├── schema.prisma           <- Single source of truth for DB models
│   └── migrations/
├── scripts/
│   └── dev.mjs                 <- Concurrent dev-server launcher
├── .env.example                <- Root env template (API + DB vars)
├── package.json                <- Workspace root with shared scripts
└── prisma.config.ts
```

### System Architecture Diagram

```
+--------------------------------------------------------------------+
|                          CLIENT BROWSER                            |
|  React 19  .  Vite  .  TanStack Query  .  Zustand  .  Lucide     |
+---------------------------+----------------------------------------+
                            |  HTTPS  (JWT Bearer / httpOnly Cookie)
                            v
+--------------------------------------------------------------------+
|                     EXPRESS API  (port 5000)                       |
|                                                                    |
|  Helmet . CORS . Compression . Cookie-Parser . Rate Limiter       |
|                                                                    |
|  +--------------+  +--------------+  +----------------------+     |
|  |  Auth Routes |  | File/Folder  |  | Billing / Stripe /   |     |
|  |  /api/auth   |  |   Routes     |  | Razorpay /api/billing|     |
|  +--------------+  +--------------+  +----------------------+     |
|  +--------------+  +--------------+  +----------------------+     |
|  | Permissions  |  |  Audit Logs  |  | Signatures / Approval|     |
|  | /api/perms   |  |  /api/audit  |  | Workflows            |     |
|  +--------------+  +--------------+  +----------------------+     |
|                                                                    |
|          verifyAuth -> requireRole -> Route Handler                |
|                        |                                           |
|             Prisma ORM (pg adapter, connection pool)              |
+--------+---------------------------------------------+------------+
         |                                             |
         v                                             v
+------------------+                      +-----------------------+
|  PostgreSQL DB   |                      |  Cloudflare R2 / S3   |
|  (Neon / Render  |                      |  (Blob/File storage)  |
|   / Supabase)    |                      |  Short-lived presigned|
+------------------+                      |  URLs (5 min download,|
                                          |  1 hr preview)        |
                                          +-----------------------+
         |
         v
+------------------------------+
|  External Services           |
|  . SendGrid  (email)         |
|  . Stripe    (billing)       |
|  . Razorpay  (billing alt.)  |
|  . Tesseract (OCR / search)  |
+------------------------------+
```

### Database Schema Overview

| Model | Purpose |
|---|---|
| `Tenant` | An Organisation. Root of all multi-tenancy isolation. Holds Stripe/Razorpay subscription IDs and plan state. |
| `User` | Belongs to one Tenant. Has a single `Role` and an optional `RoleProfile` for fine-grained capability overrides. |
| `RoleProfile` | Named capability preset (JSON `capabilities` column). Reusable across users in the same tenant. |
| `Department` | Logical grouping of Users within a Tenant. Can be granted permissions on resources. |
| `Folder` | Supports unlimited nesting via parent/child self-relation and materialised `path` column for fast tree queries. |
| `File` | Linked to a Folder and Tenant. Tracks `version`, `storageKey` (R2/S3 key), full-text `searchText`, approval status, and signature status. |
| `FileVersion` | Immutable history of each file version upload. |
| `Permission` | Granular access grant linking a resource (file/folder) to a user or department with a JSON `capabilities` map and optional `expiresAt`. |
| `AuditLog` | Immutable append-only record of every important platform action with `ipAddress` and `userAgent`. |
| `ApprovalWorkflow` / `ApprovalStep` | Multi-step sequential document approval chain. |
| `SignatureWorkflow` / `SignatureStep` | Multi-step document e-signing chain with `accessToken` per signer. |
| `InviteToken` | Invitation-only onboarding; users cannot self-register. |
| `OneTimeLink` | Expiring, read-only share links for external guests. |
| `GuestAccess` | Richer external sharing with granular JSON `capabilities` and revocation support. |
| `Tag` / `FileTag` | Many-to-many file tagging with tenant-scoped colour coding. |
| `MetadataTemplate` / `FolderMetadataField` | Admin-defined custom metadata schemas applied at the folder level. |
| `Notification` | Per-user in-app notification feed. |

### API Route Map

| Prefix | Router File | Description |
|---|---|---|
| `/api/auth` | `auth.routes.ts` | Login, refresh, invite, password reset, impersonation |
| `/api/files` | `files.routes.ts` | Upload, download, preview, versioning, OCR, locking, bulk ops |
| `/api/folders` | `folders.routes.ts` | CRUD, move, archive, tree, materialised path |
| `/api/categories` | `categories.routes.ts` | Tenant sidebar categories |
| `/api/users` | `users.routes.ts` | User CRUD, invite, deactivate, department assignment |
| `/api/permissions` | `permissions.routes.ts` | Grant/revoke RBAC and granular permissions |
| `/api/audit` | `audit.routes.ts` | Paginated, filterable audit log retrieval |
| `/api/search` | `search.routes.ts` | Full-text + metadata search (OCR-indexed) |
| `/api/tags` | `tags.routes.ts` | Tag CRUD and file-tag associations |
| `/api/billing` | `billing.routes.ts` | Stripe/Razorpay checkout, webhook, subscription verify |
| `/api/guest` | `guest.routes.ts` | Guest access token validation and file serving |
| `/api/templates` | `templates.routes.ts` | Metadata template CRUD |
| `/api/preferences` | `preferences.routes.ts` | Per-user key/value preference store |
| `/api/workflow` | `workflow.routes.ts` | Approval workflow CRUD and action endpoints |
| `/api/signing` | `signatures.routes.ts` | Signature workflow CRUD and public signing endpoint |
| `/api/roles` | `roles.routes.ts` | RoleProfile CRUD |
| `/api/notifications` | `notifications.routes.ts` | In-app notification feed |
| `/api/superadmin` | `superadmin.routes.ts` | Cross-tenant org management (SUPERADMIN only) |
| `/api/dashboard` | `dashboard.routes.ts` | Usage stats, recent activity |
| `/health` | `index.ts` | Liveness probe (queries DB) |

### Frontend Route Map

| Path | Page Component | Access Guard |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/invite/:token` | `AcceptInvitePage` | Public |
| `/forgot-password` | `ForgotPasswordPage` | Public |
| `/reset-password/:token` | `ResetPasswordPage` | Public |
| `/view/:token` | `OneTimeViewPage` | Public (token-gated) |
| `/guest/:token` | `GuestAccessPage` | Public (token-gated) |
| `/sign/:token` | `SignDocumentPage` | Public (token-gated) |
| `/` | `DashboardPage` | `AdminRoute` |
| `/browse/:folderId?` | `FileBrowserPage` | `ProtectedRoute` |
| `/category/:categoryId` | `CategoryPage` | `ProtectedRoute` |
| `/recent` | `RecentPage` | `ProtectedRoute` |
| `/starred` | `StarredPage` | `ProtectedRoute` |
| `/trash` | `TrashPage` | `ProtectedRoute` |
| `/tags` | `TagsPage` | `ProtectedRoute` |
| `/search` | `SearchPage` | `ProtectedRoute` |
| `/metadata/file/:fileId` | `MetadataPage` | `ProtectedRoute` |
| `/metadata/folder/:folderId` | `MetadataPage` | `ProtectedRoute` |
| `/billing` | `BillingPage` | `AdminRoute` |
| `/admin/users` | `UsersPage` | `AdminRoute` |
| `/admin/audit` | `AuditLogPage` | `ORG_ADMIN`, `MANAGER`, `SUPERADMIN` |
| `/admin/templates` | `TemplatesPage` | `ORG_ADMIN`, `MANAGER`, `SUPERADMIN` |
| `/admin/settings` | `SettingsPage` | `AdminRoute` |
| `/admin/shared-links` | `SharedLinksPage` | `AdminRoute` |
| `/admin/permissions` | `PermissionsOverviewPage` | `AdminRoute` |
| `/superadmin/orgs` | `OrgsPage` | `SuperadminRoute` (SUPERADMIN only) |

---

## Tech Stack

### Backend (`apps/api`)

| Category | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 |
| Language | TypeScript 5 |
| ORM | Prisma 7 (PG driver adapter) |
| Database | PostgreSQL |
| Auth | JSON Web Tokens (`jsonwebtoken`), bcryptjs |
| Validation | Zod 3 |
| File Uploads | Multer |
| Storage | AWS S3 SDK v3 / Cloudflare R2 (S3-compatible) |
| Email | SendGrid (`@sendgrid/mail`) |
| Billing | Stripe 15, Razorpay |
| OCR / Parsing | Tesseract.js 7, pdf-parse, sharp |
| Spreadsheet | xlsx |
| PDF Generation | PDFKit |
| Archiving | archiver |
| Security | Helmet, CORS, express-rate-limit, cookie-parser |

### Frontend (`apps/web`)

| Category | Technology |
|---|---|
| Framework | React 19 |
| Build Tool | Vite 8 |
| Language | TypeScript 5 |
| Styling | TailwindCSS 4 |
| Routing | React Router DOM 7 |
| Server State | TanStack React Query 5 |
| Client State | Zustand 5 |
| HTTP Client | Axios |
| PDF Viewer | `@react-pdf-viewer/core`, `react-pdf` |
| File Upload UX | react-dropzone |
| Icons | Lucide React |
| Class Utilities | clsx |

### Shared (`packages/shared`)

| Item | Detail |
|---|---|
| Zod schemas | Shared validation schemas imported by both apps |
| TypeScript types | Common DTOs and enums |

---

## Core Features

| Feature | Details |
|---|---|
| **Multi-Tenancy** | Every DB row is scoped to a `tenantId`. Cross-tenant data leakage is architecturally impossible at the Prisma query layer. |
| **Invitation-Only Onboarding** | Users cannot self-register. Admins send invite emails; tokens expire after use. |
| **File & Folder Browser** | Infinite nested folders via materialised path indexing. Drag-and-drop upload, bulk actions, rename, move, archive. |
| **File Versioning** | Every upload to an existing file creates a new `FileVersion` record with uploader identity and timestamp. |
| **Full-Text Search** | OCR (Tesseract), PDF text extraction (`pdf-parse`), and metadata search. Results indexed per tenant. |
| **Approval Workflows** | Multi-step sequential approval chains on documents. Each step has a designated approver; actions are logged immutably. |
| **E-Signature Workflows** | Multi-step sequential/parallel signing chains. External signers receive a unique `accessToken`; signing captured as JSON. |
| **Audit Logs** | Every key action (`file.upload`, `user.login`, `permission.grant`, etc.) written to an append-only `AuditLog` table with IP and user-agent. |
| **Granular Permissions** | Beyond roles, individual files/folders can have user- or department-level access grants with JSON capability maps and optional expiry. |
| **One-Time Links** | Admins generate single-use expiring links for external read-only access to a specific file. |
| **Guest Access** | Richer external sharing with configurable capabilities (download, preview) and revocation. |
| **Metadata Templates** | Admins define custom field schemas per folder. Files inside inherit required fields (recursion optional). |
| **Tags** | Colour-coded, tenant-scoped tags on files with bulk-tag support. |
| **Subscription Billing** | Stripe and Razorpay integrations. Instant subscription sync via a `/api/billing/verify` endpoint called on redirect (not solely webhook-dependent). |
| **Superadmin Portal** | Cross-tenant organisation management, usage stats, and manual plan overrides accessible only to `SUPERADMIN` accounts. |
| **In-App Notifications** | Per-user notification feed with read/unread state and deep-link support. |
| **File Locking** | Files can be locked by a user to prevent concurrent edits. Lock holder tracked. |
| **Soft Delete & Trash** | Files and folders are soft-deleted (`isDeleted` flag) and recoverable from the Trash view. |
| **Starred Items** | Users can star files and folders for quick access. |
| **Categories** | Top-level sidebar categories (Projects, Finance, HR...) grouping folders and files. |
| **Role Profiles** | Named capability presets (JSON) assignable to users as an alternative to bare macro roles. |

---

## Permission System

### Macro Roles (RBAC)

Every `User` holds exactly one `Role` enum value:

| Role | Scope | Capabilities |
|---|---|---|
| `SUPERADMIN` | Platform-wide (outside any tenant) | Full platform control, cross-tenant management, manual billing overrides |
| `ORG_ADMIN` | Tenant-wide | Full control of their org: users, billing, settings, all files |
| `MANAGER` | Tenant-wide | Manage departments, permissions, audit logs. Cannot touch billing. |
| `EDITOR` | Tenant-wide | Upload, edit, move, share files. Cannot alter top-level folder structures. |
| `VIEWER` | Tenant-wide | Read-only: download and preview only. |

**Usage in route handlers:**

```typescript
import { verifyAuth, requireRole } from "../middleware/auth";

// Only ORG_ADMIN or MANAGER may create departments
router.post(
  "/departments",
  verifyAuth,
  requireRole("ORG_ADMIN", "MANAGER"),
  async (req, res) => { /* ... */ }
);
```

> `requireRole` accepts a spread of role strings and normalises legacy aliases (`ADMIN` -> `ORG_ADMIN`).

### Granular Permissions

The `Permission` table provides hyper-specific per-resource access overrides beyond what macro roles allow.

**Schema fields of interest:**

| Field | Type | Purpose |
|---|---|---|
| `resourceType` | `"file"` or `"folder"` | What resource is being gated |
| `resourceId` | `String` | The ID of that resource |
| `grantedTo` | `"all"` / `"user"` / `"department"` | Who receives the grant |
| `capabilities` | `Json?` | Fine-grained boolean map e.g. `{ "see_metadata": true, "delete": false }` |
| `expiresAt` | `DateTime?` | Optional automatic expiry |

**Adding a new capability (developer guide):**

1. Add the new capability key to the UI in `apps/web/src/pages/admin/PermissionsOverviewPage.tsx`.
2. In the relevant route file under `apps/api/src/routes/`, run a Prisma query checking the `Permission` table for the requesting user/department and the required capability key before executing the action.

---

## Quick Start

### Prerequisites

| Tool | Minimum Version |
|---|---|
| Node.js | 20 LTS |
| npm | 10+ |
| PostgreSQL | 14+ |

> **Storage:** Files default to a local `uploads/` directory when no R2/S3 credentials are provided. Set `API_PUBLIC_URL` so that local-file download links resolve correctly.

---

### 1 — Clone & Install

```bash
git clone https://github.com/your-org/storeit.git
cd storeit
npm install
```

`postinstall` automatically runs `prisma generate` if Prisma is available.

---

### 2 — Configure Environment Variables

Copy the root template and fill in your values:

```bash
cp .env.example .env
```

For the frontend, create a separate env file:

```bash
# apps/web/.env
VITE_API_URL=http://localhost:5000/api
```

See the [Environment Variables Reference](#environment-variables-reference) section for every available key.

---

### 3 — Database Setup

```bash
# Apply all migrations and generate the Prisma client
npx prisma migrate dev --schema prisma/schema.prisma

# Seed default tenant, roles, and users
npm run db:seed
```

---

### 4 — Run the Development Server

```bash
npm run dev
```

This single command (via `scripts/dev.mjs`) concurrently starts:

| Service | URL |
|---|---|
| React frontend | http://localhost:5173 |
| Express API | http://localhost:5000 |
| Health probe | http://localhost:5000/health |

You can also start them individually:

```bash
npm run dev:api   # API only
npm run dev:web   # Frontend only
```

---

### Seed Credentials

After running `npm run db:seed`:

| Role | Email | Password |
|---|---|---|
| `SUPERADMIN` | super@platform.com | `Super@123` |
| `ORG_ADMIN` (Acme Corp) | admin@acme.com | `Admin@123` |
| `MANAGER` (Acme Corp) | manager@acme.com | `Manager@123` |
| `EDITOR` (Acme Corp) | editor@acme.com | `Editor@123` |
| `VIEWER` (Acme Corp) | viewer@acme.com | `Viewer@123` |

---

## Environment Variables Reference

All variables live in the **root `.env`** unless marked `[web]`.

### Database

| Variable | Example | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/storeit` | Yes |

### API Server

| Variable | Example | Notes |
|---|---|---|
| `PORT` | `5000` | Default: 5000 |
| `NODE_ENV` | `development` | |
| `FRONTEND_URL` | `http://localhost:5173` | Comma-separated for multiple origins |
| `API_PUBLIC_URL` | `http://localhost:5000` | Used for local-file fallback download links |

### Auth

| Variable | Example | Notes |
|---|---|---|
| `JWT_SECRET` | `a-long-random-string` | Required |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |

### Storage (Cloudflare R2 / AWS S3)

| Variable | Example | Notes |
|---|---|---|
| `R2_ACCOUNT_ID` | `abc123` | Leave blank to use local disk |
| `R2_ACCESS_KEY_ID` | | |
| `R2_SECRET_ACCESS_KEY` | | |
| `R2_BUCKET_NAME` | `storeit-files` | |
| `R2_PUBLIC_URL` | `https://pub.r2.dev/...` | CDN URL for public assets |

### Billing

| Variable | Example | Notes |
|---|---|---|
| `BILLING_MOCK_MODE` | `false` | Set `true` to skip real payment calls in dev |
| `RAZORPAY_KEY_ID` | `rzp_test_xxxx` | |
| `RAZORPAY_KEY_SECRET` | | |
| `RAZORPAY_WEBHOOK_SECRET` | | |
| `RAZORPAY_PLAN_MINI` | `plan_xxx` | |
| `RAZORPAY_PLAN_MEDIUM` | `plan_xxx` | |
| `RAZORPAY_PLAN_TAILOR` | `plan_xxx` | |

### Email (SendGrid)

| Variable | Example |
|---|---|
| `SENDGRID_API_KEY` | `SG.xxxxx` |
| `FROM_EMAIL` | `noreply@yourapp.com` |

### App

| Variable | Example |
|---|---|
| `APP_URL` | `http://localhost:5173` |

### Frontend only — `apps/web/.env` `[web]`

| Variable | Example |
|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` |

---

## Scripts Reference

All scripts run from the **workspace root** unless noted.

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start both API and web dev servers concurrently |
| `dev:api` | `npm run dev:api` | Start API in watch mode (nodemon + ts-node) |
| `dev:web` | `npm run dev:web` | Start Vite dev server |
| `build:web` | `npm run build:web` | Production build of the React app |
| `db:migrate` | `npm run db:migrate` | Run Prisma migrations |
| `db:generate` | `npm run db:generate` | Regenerate Prisma client |
| `db:studio` | `npm run db:studio` | Open Prisma Studio GUI |
| `db:seed` | `npm run db:seed` | Seed default users and tenant |

---

## Deployment Guide

### Database

Deploy a managed PostgreSQL instance on one of:
- [Neon](https://neon.tech) (serverless, free tier available)
- [Supabase](https://supabase.com)
- [Render Postgres](https://render.com/docs/databases)

Copy the connection string into `DATABASE_URL`.

### API Backend (Render)

1. Connect your GitHub repository as a **Web Service**.
2. Set the following in Render's dashboard:

| Setting | Value |
|---|---|
| **Build Command** | `npm install && npx prisma generate --schema prisma/schema.prisma && npm run build --workspace=apps/api` |
| **Start Command** | `cd apps/api && npm start` |

3. Add all environment variables from the [reference table](#environment-variables-reference).

> **Important:** Set `FRONTEND_URL` to your Vercel deployment URL with **no trailing slash**.
> **Important:** If not using R2, set `API_PUBLIC_URL` to the public Render API URL so local-file download links resolve correctly.

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel.
2. Configure the project:

| Setting | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `apps/web` |
| **Build Command** | `vite build` |
| **Output Directory** | `dist` |

3. Add environment variable:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://your-api.onrender.com/api` |

The `vercel.json` in `apps/web` already contains a catch-all rewrite rule so React Router's client-side routing works correctly on Vercel.

---

## Security & Hardening

| Mechanism | Implementation |
|---|---|
| **JWT Access + Refresh Tokens** | Short-lived access tokens (15 min default). Refresh token stored in `httpOnly` cookie. CSRF guard (`x-requested-with` header check) on the refresh endpoint. |
| **Stale JWT Invalidation** | Every request runs a lightweight DB lookup to confirm the user is still active and the tenant is not suspended — stale tokens from deactivated accounts are rejected immediately. |
| **Rate Limiting** | `express-rate-limit` applied globally (200 req / 15 min), strictly on auth (25 req / 15 min), on uploads (500 req / 15 min), and on public signing (120 req / 15 min). |
| **MIME Type Allowlist** | Uploads checked against an explicit allowlist of safe MIME types **before** reaching the route handler. Dangerous extensions (`.exe`, `.sh`, `.js`, `.svg`, `.php`, etc.) are blocked by a secondary extension check — because clients can lie about MIME type. |
| **UUID Validation Guard** | All `/:id` route parameters are validated with `Zod.uuid()` before any Prisma query executes, blocking injection and malformed IDs at the boundary. |
| **Presigned URL TTLs** | `VIEW` = 1 hour, `DOWNLOAD` = 5 minutes, `ONE_TIME` = 5 minutes. Defined as a single constant in `security.ts`. |
| **Helmet** | Sets HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) on every response. |
| **GZIP Compression** | `compression` middleware reduces response payload size. |
| **Global Error Handler** | All unhandled errors are funnelled through `errorHandler.ts` which strips stack traces in production before serialising the JSON error response. |
| **Graceful Shutdown** | `SIGTERM` / `SIGINT` handlers properly disconnect Prisma and drain the PG pool before the process exits. |
| **Tenant Isolation** | Every Prisma query is scoped with `tenantId` from the verified JWT — there is no shared query context that can be manipulated to expose cross-tenant data. |

---

## Third-Party Licenses

StoreIT integrates the following open-source libraries. Each is subject to its own license.

### Backend (`apps/api`)

| Package | License | Purpose |
|---|---|---|
| `express` | MIT | HTTP server framework |
| `@prisma/client`, `prisma` | Apache-2.0 | ORM and schema management |
| `@prisma/adapter-pg` | Apache-2.0 | Prisma PG driver adapter |
| `pg` | MIT | PostgreSQL client |
| `jsonwebtoken` | MIT | JWT signing and verification |
| `bcryptjs` | MIT | Password hashing |
| `zod` | MIT | Schema validation |
| `multer` | MIT | Multipart file upload handling |
| `@aws-sdk/client-s3` | Apache-2.0 | S3 / R2 blob storage |
| `@aws-sdk/s3-request-presigner` | Apache-2.0 | Presigned URL generation |
| `stripe` | MIT | Stripe billing integration |
| `@sendgrid/mail` | MIT | Transactional email |
| `tesseract.js` | Apache-2.0 | OCR for image full-text search |
| `pdf-parse` | MIT | PDF text extraction |
| `sharp` | Apache-2.0 | Image processing and thumbnail generation |
| `pdfkit` | MIT | PDF generation (signature certificates) |
| `xlsx` | Apache-2.0 | Excel file parsing |
| `archiver` | MIT | ZIP archive creation |
| `helmet` | MIT | HTTP security headers |
| `cors` | MIT | Cross-origin resource sharing |
| `compression` | MIT | GZIP response compression |
| `express-rate-limit` | MIT | Request rate limiting |
| `cookie-parser` | MIT | Cookie parsing |
| `deepmerge` | MIT | Deep object merging |
| `dotenv` | BSD-2-Clause | Environment variable loading |
| `uuid` | MIT | UUID generation |
| `nodemon` | MIT | Dev server file watching |
| `ts-node` | MIT | TypeScript execution for Node.js |
| `typescript` | Apache-2.0 | Language compiler |

### Frontend (`apps/web`)

| Package | License | Purpose |
|---|---|---|
| `react`, `react-dom` | MIT | UI framework |
| `vite` | MIT | Build tool and dev server |
| `typescript` | Apache-2.0 | Language compiler |
| `tailwindcss` | MIT | Utility-first CSS framework |
| `@tanstack/react-query` | MIT | Server state management and caching |
| `zustand` | MIT | Client state management |
| `react-router-dom` | MIT | Client-side routing |
| `axios` | MIT | HTTP client |
| `lucide-react` | ISC | Icon library |
| `react-dropzone` | MIT | Drag-and-drop file upload UX |
| `react-pdf` | MIT | PDF rendering in the browser |
| `@react-pdf-viewer/core` | Apache-2.0 | Advanced PDF viewer component |
| `@react-pdf-viewer/default-layout` | Apache-2.0 | PDF viewer layout plugin |
| `clsx` | MIT | Conditional CSS class utility |
| `eslint` + plugins | MIT / various | Code linting |

> **Note:** This list reflects direct production and development dependencies. Transitive dependencies may introduce additional licenses.
> Run `npx license-checker --production` in the workspace root for a full transitive dependency report.

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Follow existing TypeScript conventions. All new route files go in `apps/api/src/routes/`, new services in `apps/api/src/services/`.
3. Always scope Prisma queries with `tenantId` from `req.user.tenantId` — **never trust client-supplied tenant IDs**.
4. Add or update Zod validation for any new request body.
5. Log relevant events to `AuditLog` for compliance (use the `audit.service.ts` helper).
6. Run `npm run db:migrate` and commit the generated migration file if you modify `schema.prisma`.
7. Open a Pull Request with a clear description of what changed and why.

---

*StoreIT is copyright 2026. All rights reserved.*
