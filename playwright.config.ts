import { defineConfig } from "@playwright/test";

/**
 * E2E smoke tests against a local dev server backed by the real Supabase
 * project (.env.local). Tests clean up any rows they create.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // serial — tests share one backend
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
