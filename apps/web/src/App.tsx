import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "./store/authStore";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import FileBrowserPage from "./pages/FileBrowserPage";
import CategoryPage from "./pages/CategoryPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import UsersPage from "./pages/admin/UsersPage";
import RecentPage from "./pages/RecentPage";
import StarredPage from "./pages/StarredPage";
import TagsPage from "./pages/TagsPage";
import TrashPage from "./pages/TrashPage";
import SettingsPage from "./pages/admin/SettingsPage";
import OrgsPage from "./pages/superadmin/OrgsPage";
import OneTimeViewPage from "./pages/OneTimeViewPage";
import AuditLogPage from "./pages/admin/AuditLogPage";
import SearchPage from "./pages/SearchPage";
import { ToastContainer } from "./components/ui/Toast";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import BillingPage from "./pages/admin/BillingPage";
import TemplatesPage from "./pages/admin/TemplatesPage";
import SharedLinksPage from "./pages/admin/SharedLinksPage";
import PermissionsOverviewPage from "./pages/admin/PermissionsOverviewPage";
import GuestAccessPage from "./pages/GuestAccessPage";

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
              <ProtectedRoute allowedRoles={["ORG_ADMIN", "MANAGER", "SUPERADMIN"]}>
                <AuditLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/templates"
            element={
              <ProtectedRoute allowedRoles={["ORG_ADMIN", "MANAGER", "SUPERADMIN"]}>
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
          <Route path="/superadmin/orgs" element={<SuperadminRoute><OrgsPage /></SuperadminRoute>} />
          <Route path="/view/:token" element={<OneTimeViewPage />} />
          <Route path="/guest/:token" element={<GuestAccessPage />} />
          <Route path="/admin/audit" element={<AdminRoute><AuditLogPage /></AdminRoute>} />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchPage />
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
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
