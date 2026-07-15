import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests for the public critical path. Run against a live app:
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 * (Auth-gated flows need Clerk test users — tracked as a follow-up.)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
