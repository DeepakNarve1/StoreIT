import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useThemeStore } from "./store/themeStore";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/ui/ErrorBoundary";

const isDark =
  JSON.parse(localStorage.getItem("theme") || "{}").state?.isDark ??
  window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.classList.toggle("dark", isDark);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
