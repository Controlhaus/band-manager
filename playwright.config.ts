import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests (§14.10). Runs against a dev server on localhost:3000 with
 * the demo seed present (SEED_DEMO=true). Runs once desktop, once mobile
 * (§14.12). Requires the DB up and seeded.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
