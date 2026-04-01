import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
}

function getInitialIsDark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("theme");
    if (raw) {
      const parsed = JSON.parse(raw) as any;
      const persisted = parsed?.state?.isDark;
      if (typeof persisted === "boolean") return persisted;
    }
  } catch {
    // ignore
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

function syncDarkClass(isDark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", isDark);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: getInitialIsDark(),
      toggle: () =>
        set((s) => {
          const next = !s.isDark;
          syncDarkClass(next);
          return { isDark: next };
        }),
      setDark: (dark) => {
        syncDarkClass(dark);
        set({ isDark: dark });
      },
    }),
    {
      name: "theme",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        syncDarkClass(state.isDark);
      },
    },
  ),
);
