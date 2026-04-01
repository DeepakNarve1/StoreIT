import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  tenantName: string;
  roleProfile?: {
    id: string | null;
    name: string;
    baseRole: string;
    capabilities: Record<string, boolean>;
  } | null;
  roleCapabilities?: Record<string, boolean>;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: typeof window !== "undefined" ? localStorage.getItem("access_token") : null,
      isAuthenticated:
        typeof window !== "undefined" && !!localStorage.getItem("access_token"),
      setAuth: (user, token) => {
        localStorage.setItem("access_token", token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("auth-storage");
        set({ user: null, token: null, isAuthenticated: false });
      },
      updateUser: (updates) =>
        set((s) => ({ user: s.user ? { ...s.user, ...updates } : null })),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state || typeof window === "undefined") return;
        const token = localStorage.getItem("access_token");
        // Ensure the UI auth state cannot drift from the request auth state.
        state.token = token;
        state.isAuthenticated = !!token;
        if (!token) state.user = null;
      },
    },
  ),
);
