import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Components use the automatic JSX runtime (Next sets it for the app build).
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
  },
});
