import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-pdf") || id.includes("@react-pdf-viewer")) {
            return "pdf";
          }
          if (id.includes("react-router-dom") || id.includes("@tanstack/react-query")) {
            return "router-query";
          }
          if (id.includes("lucide-react")) {
            return "icons";
          }
          if (id.includes("react") || id.includes("react-dom")) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
});
