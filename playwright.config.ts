import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT || "4173";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  use: {
    baseURL,
    trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1"
      ? undefined
      : {
          command: `npm run start -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.PLAYWRIGHT_PORT,
        },
});
