import { defineConfig, devices } from "@playwright/test";
if (
  !/^buglens_test(?:_[a-z0-9]+)?$/.test(
    new URL(
      process.env.DATABASE_URL || "postgresql://localhost/invalid",
    ).pathname.slice(1),
  )
)
  throw Error("E2E requires an isolated buglens_test database");
if (!process.env.SCREENSHOT_DIR?.includes("buglens-test"))
  throw Error("E2E requires a temporary buglens-test screenshot directory");
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      testMatch: /mobile.spec.ts/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run start -w @buglens/web",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
