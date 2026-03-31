import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import OneTimeViewPage from "./pages/OneTimeViewPage";
import { ToastContainer } from "./components/ui/Toast";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const FileBrowserPage = lazy(() => import("./pages/FileBrowserPage"));
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const RecentPage = lazy(() => import("./pages/RecentPage"));
const StarredPage = lazy(() => import("./pages/StarredPage"));
const TagsPage = lazy(() => import("./pages/TagsPage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const OrgsPage = lazy(() => import("./pages/superadmin/OrgsPage"));
const AuditLogPage = lazy(() => import("./pages/admin/AuditLogPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const BillingPage = lazy(() => import("./pages/admin/BillingPage"));
const TemplatesPage = lazy(() => import("./pages/admin/TemplatesPage"));
const SharedLinksPage = lazy(() => import("./pages/admin/SharedLinksPage"));
const PermissionsOverviewPage = lazy(
  () => import("./pages/admin/PermissionsOverviewPage"),
);
const GuestAccessPage = lazy(() => import("./pages/GuestAccessPage"));
const MetadataPage = lazy(() => import("./pages/MetadataPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role ?? "")) {
    return <Navigate to="/" replace />; // Or a more specific unauthorized page
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const allowed = ["ORG_ADMIN", "SUPERADMIN", "MANAGER"];
  if (!allowed.includes(user?.role ?? "")) {
    return <Navigate to="/browse" replace />;
  }

  return <>{children}</>;
}

function SuperadminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.role !== "SUPERADMIN") {
    // ✅ SUPERADMIN only
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<AcceptInvitePage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/reset-password/:token"
              element={<ResetPasswordPage />}
            />
            <Route
              path="/"
              element={
                <AdminRoute>
                  <DashboardPage />
                </AdminRoute>
              }
            />
            <Route
              path="/browse/:folderId?"
              element={
                <ProtectedRoute>
                  <FileBrowserPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/category/:categoryId"
              element={
                <ProtectedRoute>
                  <CategoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="/recent"
              element={
                <ProtectedRoute>
                  <RecentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/starred"
              element={
                <ProtectedRoute>
                  <StarredPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute
                  allowedRoles={["ORG_ADMIN", "MANAGER", "SUPERADMIN"]}
                >
                  <AuditLogPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/templates"
              element={
                <ProtectedRoute
                  allowedRoles={["ORG_ADMIN", "MANAGER", "SUPERADMIN"]}
                >
                  <TemplatesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/tags"
              element={
                <ProtectedRoute>
                  <TagsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trash"
              element={
                <ProtectedRoute>
                  <TrashPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route
              path="/superadmin/orgs"
              element={
                <SuperadminRoute>
                  <OrgsPage />
                </SuperadminRoute>
              }
            />
            <Route path="/view/:token" element={<OneTimeViewPage />} />
            <Route path="/guest/:token" element={<GuestAccessPage />} />
            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <SearchPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/metadata/file/:fileId"
              element={
                <ProtectedRoute>
                  <MetadataPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/metadata/folder/:folderId"
              element={
                <ProtectedRoute>
                  <MetadataPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <AdminRoute>
                  <BillingPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/shared-links"
              element={
                <AdminRoute>
                  <SharedLinksPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/permissions"
              element={
                <AdminRoute>
                  <PermissionsOverviewPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
