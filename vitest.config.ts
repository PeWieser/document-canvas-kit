import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    // Use happy-dom for a lightweight browser-like environment.
    // This lets us import zustand stores without needing a full DOM.
    environment: "happy-dom",
    globals: true,
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    // Do NOT process files that need SSR or Cloudflare Workers APIs.
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/lib/pdf/**", "src/store/**"],
      exclude: ["src/lib/pdf/pdfjs.ts", "src/lib/pdf/polyfill.ts"],
    },
  },
  resolve: {
    alias: {
      // Match the @ alias used throughout the project.
      "@": resolve(__dirname, "./src"),
    },
  },
});
