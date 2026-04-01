import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ui/ErrorBoundary";

// Apply theme class early. The theme store also syncs on rehydrate,
// but this avoids a flash of incorrect theme on first paint.
if (typeof document !== "undefined") {
  let isDark = false;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("theme");
      const persisted = raw ? (JSON.parse(raw) as any)?.state?.isDark : undefined;
      if (typeof persisted === "boolean") {
        isDark = persisted;
      } else {
        isDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      }
    } catch {
      isDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
  }
  document.documentElement.classList.toggle("dark", isDark);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
