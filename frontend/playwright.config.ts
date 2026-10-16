import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a real backend on a scratch database (see the "e2e" job in
// .github/workflows/ci.yml and scripts/e2e_seed.py). The frontend and API must already be
// running; E2E_BASE_URL / E2E_API_URL point at them.
export default defineConfig({
  testDir: "./e2e",
  // Tests register their own users, so they are independent and can run side by side.
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fa-IR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
