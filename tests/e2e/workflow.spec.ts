import { test, expect } from "@playwright/test";
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("demo@buglens.local");
  await page.getByLabel("Password", { exact: true }).fill("BugLens-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The whole picture." }),
  ).toBeVisible();
}
async function form(page: import("@playwright/test").Page) {
  await page.goto("/demo?token=URL_SECRET");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("E2E checkout failure");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Order fails intentionally.");
}
test("signup, project and snippet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test developer");
  await page.getByLabel("Email address").fill(`e2e-${Date.now()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("E2E store");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".snippet")).toContainText("data-project-key");
});
test("widget diagnostics, retry, screenshot, triage and notes", async ({
  page,
}) => {
  await login(page);
  await form(page);
  await page.getByText("Preview exact report payload").click();
  await expect(page.locator("#preview")).toContainText("503");
  await expect(page.locator("#preview")).not.toContainText("URL_SECRET");
  await expect(page.locator("#preview")).not.toContainText("private-reporter");
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  await expect(page.getByLabel("Screenshot annotation canvas")).toBeVisible();
  await page.getByLabel("Annotation", { exact: true }).selectOption("redact");
  const canvas = page.getByLabel("Screenshot annotation canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.up();
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) =>
      Array.from(
        c
          .getContext("2d")!
          .getImageData(
            (50 * c.width) / c.clientWidth,
            (50 * c.height) / c.clientHeight,
            1,
            1,
          ).data,
      ),
    ),
  ).toEqual([0, 0, 0, 255]);
  let failed = true;
  await page.route("**/api/ingest", async (route) => {
    if (failed) {
      failed = false;
      await route.fulfill({ status: 503, body: "{}" });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Could not send");
  await expect(page.getByLabel("Title *", { exact: true })).toHaveValue(
    "E2E checkout failure",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Report sent");
  await page.goto("/");
  await page
    .getByRole("button", { name: "E2E checkout failure", exact: true })
    .first()
    .click();
  await page.getByLabel("Report status").selectOption("RESOLVED");
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await page.reload();
  await page
    .getByRole("button", { name: "E2E checkout failure", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await page.getByLabel("Note", { exact: true }).fill("Investigating checkout");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByText("Investigating checkout", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "E2E checkout failure", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Investigating checkout", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(
    page.getByText("Investigating checkout", { exact: true }),
  ).toHaveCount(0);
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The whole picture." }),
  ).toBeVisible();
});
test("required fields, keyboard, screenshot removal, no screenshot and host styles", async ({
  page,
}) => {
  await page.goto("/demo");
  const color = await page
    .getByRole("button", { name: "Place order", exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const launcher = page.getByRole("button", {
    name: "Report a problem",
    exact: true,
  });
  await launcher.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Title *", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByLabel("Title *", { exact: true })).toBeFocused();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("No screenshot needed");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Useful report without image");
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  await expect(page.getByLabel("Screenshot annotation canvas")).toBeVisible();
  await page
    .getByRole("button", { name: "Remove screenshot", exact: true })
    .click();
  await expect(page.getByLabel("Screenshot annotation canvas")).toBeHidden();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Report sent");
  expect(
    await page
      .getByRole("button", { name: "Place order", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(color);
});
test("invalid origins, keys, size and unauthenticated access", async ({
  request,
}) => {
  const payload = {
    projectKey: "invalid",
    title: "Bug",
    description: "Broken",
    steps: "",
    expected: "",
    pageUrl: "http://test/",
    browser: "Chrome",
    viewport: "800x600",
    events: [],
  };
  expect(
    (
      await request.post("/api/ingest", {
        headers: { origin: "https://evil.test" },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/ingest", {
        headers: { origin: "https://evil.test" },
        data: { ...payload, projectKey: "buglens-demo-public" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/ingest", {
        headers: { origin: "http://127.0.0.1:3000" },
        data: "x".repeat(3_000_001),
      })
    ).status(),
  ).toBe(413);
  expect((await request.get("/api/reports/demo-report-0")).status()).toBe(401);
  expect(
    (await request.get("/api/reports/demo-report-0/screenshot")).status(),
  ).toBe(401);
});
test("search, filters, pagination and other-user authorization", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.getByLabel("Search reports").fill("Checkout fails");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Search reports").fill("");
  await expect(page.getByRole("button", { name: "Next →" })).toBeEnabled();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByRole("button", { name: "← Previous" })).toBeEnabled();
  await page
    .getByLabel("Filter project")
    .selectOption({ label: "Form & Field" });
  await page.getByLabel("Filter status").selectOption("RESOLVED");
  await expect(page.locator("tbody tr").first()).toContainText("resolved");
  await page.getByLabel("Filter severity").selectOption("HIGH");
  await expect(page.locator("tbody tr").first()).toContainText("high");
  const other = await browser.newContext();
  const response = await other.request.post(
    "http://127.0.0.1:3000/api/auth/sign-up/email",
    {
      data: {
        name: "Other",
        email: `other-${Date.now()}@example.test`,
        password: "other-user-password-123",
      },
      headers: { origin: "http://127.0.0.1:3000" },
    },
  );
  expect(response.ok()).toBeTruthy();
  for (const suffix of ["", "/screenshot"])
    expect(
      (
        await other.request.get(
          "http://127.0.0.1:3000/api/reports/demo-report-0" + suffix,
        )
      ).status(),
    ).toBe(404);
  expect(
    (
      await other.request.patch(
        "http://127.0.0.1:3000/api/reports/demo-report-0",
        {
          headers: { origin: "http://127.0.0.1:3000" },
          data: { status: "RESOLVED" },
        },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.delete(
        "http://127.0.0.1:3000/api/reports/demo-report-0",
        { headers: { origin: "http://127.0.0.1:3000" } },
      )
    ).status(),
  ).toBe(404);
  await other.close();
});
test("capture failure remains usable and actual outgoing payload excludes secrets", async ({
  page,
}) => {
  await form(page);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.getContext = function () {
      throw Error("Controlled canvas failure");
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  await expect(page.getByRole("status").last()).toContainText("capture failed");
  await page.getByLabel("Include sanitized diagnostics").uncheck();
  const sent = page.waitForRequest(
    (r) => r.url().endsWith("/api/ingest") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  const request = await sent;
  expect(request.postData()).not.toContain("private-reporter");
  expect(request.postData()).not.toContain("URL_SECRET");
  expect(request.postDataJSON().events).toEqual([]);
  expect(request.postDataJSON().screenshot).toBeNull();
  await expect(page.getByRole("status").last()).toContainText("Report sent");
});
