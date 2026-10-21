import { test, expect } from "./fixtures";
import sharp from "sharp";
import type { APIRequestContext } from "@playwright/test";
const origin = "http://127.0.0.1:3000";
const headers = { origin };
async function signup(request: APIRequestContext, email: string) {
  const r = await request.post("/api/auth/sign-up/email", {
    headers,
    data: {
      name: "Customer team",
      email,
      password: "communication-password-123",
    },
  });
  expect(r.ok()).toBe(true);
}
test("customer tracking, public replies, private notes, notifications, reopen and revocation", async ({
  page,
  browser,
}) => {
  await signup(page.request, `loop-${crypto.randomUUID()}@example.test`);
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Connect demo to my workspace" })
    .click();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Customer checkout report");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Checkout stops at payment");
  await expect(
    page.getByText("Your name appears in the report conversation.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill("Mina Customer");
  await page
    .getByLabel("Your email", { exact: true })
    .fill("mina@example.test");
  await page.getByRole("button", { name: "Send report" }).click();
  const link = page.getByRole("link", {
    name: "Open your private report conversation",
  });
  await expect(link).toBeVisible();
  const url = (await link.getAttribute("href"))!;
  const id = new URL(url).pathname.split("/").at(-1)!;
  const token = new URL(url).hash.slice(1);
  const context = await browser.newContext();
  const customer = await context.newPage();
  await customer.goto(url);
  await expect(
    customer.getByRole("heading", { name: "Customer checkout report" }),
  ).toBeVisible();
  await customer.getByLabel("Public reply").fill("I also tried a second card.");
  let failReply = true;
  await customer.route("**/api/track/*/messages", async (route) => {
    if (route.request().method() === "POST" && failReply) {
      failReply = false;
      await route.fulfill({
        status: 503,
        json: { error: "Controlled reply failure" },
      });
    } else await route.continue();
  });
  await customer.getByRole("button", { name: "Send public reply" }).click();
  await expect(
    customer.getByRole("alert").filter({ hasText: "Controlled reply failure" }),
  ).toBeVisible();
  await expect(customer.getByLabel("Public reply")).toHaveValue(
    "I also tried a second card.",
  );
  await customer.getByRole("button", { name: "Send public reply" }).click();
  await expect(
    customer.getByText("I also tried a second card.", { exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(
    page.getByRole("region", { name: "Workspace notifications" }),
  ).toContainText("customer reply");
  await page
    .getByRole("button", { name: "Customer checkout report", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("mina@example.test (provided by reporter; unverified)"),
  ).toBeVisible();
  await expect(
    page.getByText("I also tried a second card.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Note", { exact: true })
    .fill("INTERNAL_SECRET_DO_NOT_EXPOSE");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByLabel("Public reply")
    .fill("The checkout fix is now available.");
  await page.getByRole("button", { name: "Send public reply" }).click();
  await expect(
    page.getByText("The checkout fix is now available.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Report status").selectOption("RESOLVED");
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await customer.reload();
  await expect(
    customer.getByText("The checkout fix is now available.", { exact: true }),
  ).toBeVisible();
  await expect(customer.getByText("INTERNAL_SECRET_DO_NOT_EXPOSE")).toHaveCount(
    0,
  );
  const publicResponse = await customer.request.get(`/api/track/${id}`, {
    headers: { Authorization: "Bearer " + token },
  });
  const exposed = await publicResponse.json();
  for (const field of [
    "events",
    "screenshot",
    "notes",
    "reporterEmail",
    "trackingHash",
  ])
    expect(exposed).not.toHaveProperty(field);
  expect((await customer.request.get(`/api/reports/${id}`)).status()).toBe(401);
  expect((await customer.request.get(`/api/track/${id}`)).status()).toBe(404);
  expect(
    (
      await customer.request.post(`/api/track/${id}/messages`, {
        headers: { origin, Authorization: "Bearer " + token },
        data: { clientId: crypto.randomUUID(), body: "x".repeat(4001) },
      })
    ).status(),
  ).toBe(400);
  await customer
    .getByRole("button", { name: "Still happening? Reopen report" })
    .click();
  await expect(
    customer.getByRole("button", { name: "Still happening? Reopen report" }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Customer checkout report", exact: true })
    .click();
  await expect(page.getByLabel("Report status")).toHaveValue("OPEN");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Revoke tracking link" }).click();
  await expect(
    page.getByText("No active reporter tracking link."),
  ).toBeVisible();
  await customer.reload();
  await expect(
    customer.getByRole("alert").filter({ hasText: "expired, was revoked" }),
  ).toBeVisible();
  await context.close();
});
test("project owner invites a developer, enforces role restrictions, and revokes access", async ({
  page,
  browser,
}) => {
  const ownerEmail = `invite-owner-${crypto.randomUUID()}@example.test`;
  const developerEmail = `invited-${crypto.randomUUID()}@example.test`;
  await signup(page.request, ownerEmail);
  const projectResponse = await page.request.post("/api/projects", {
    headers,
    data: { name: "Shared customer project", origins: [origin] },
  });
  const project = await projectResponse.json();
  expect(projectResponse.status()).toBe(201);
  const image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#000" },
  })
    .png()
    .toBuffer();
  const reportResponse = await page.request.post("/api/ingest", {
    headers,
    data: {
      projectKey: project.key,
      screenshot: "data:image/png;base64," + image.toString("base64"),
      title: "Shared report",
      description: "An issue",
      steps: "",
      expected: "",
      pageUrl: origin,
      browser: "Chrome",
      viewport: "800x600",
      events: [],
    },
  });
  const report = await reportResponse.json();
  await page.goto("/");
  await page.getByRole("button", { name: "Projects", exact: false }).click();
  await page.getByRole("button", { name: "Manage project team" }).click();
  await page.getByLabel("Developer email").fill(developerEmail);
  await page.getByRole("button", { name: "Create invitation link" }).click();
  const inviteLink = page.getByLabel("Private invitation link");
  await expect(inviteLink).toHaveValue(/\/join#/);
  const link = await inviteLink.inputValue();
  const context = await browser.newContext();
  const developer = await context.newPage();
  const outsider = await browser.newContext({ baseURL: origin });
  await signup(
    outsider.request,
    `wrong-invite-${crypto.randomUUID()}@example.test`,
  );
  expect(
    (
      await outsider.request.post("/api/invitations", {
        headers,
        data: { token: new URL(link).hash.slice(1) },
      })
    ).status(),
  ).toBe(404);
  await outsider.close();
  await signup(developer.request, developerEmail);
  expect(
    (await developer.request.get(`/api/reports/${report.id}`)).status(),
  ).toBe(404);
  await developer.goto(link);
  await developer
    .getByRole("button", { name: "Accept developer invitation" })
    .click();
  await expect(developer.getByRole("status")).toContainText(
    "You joined Shared customer project",
  );
  await developer.getByRole("link", { name: "Open workspace" }).click();
  await developer
    .getByRole("button", { name: "Shared report", exact: true })
    .click();
  await expect(
    developer.getByRole("button", { name: "Delete report" }),
  ).toBeHidden();
  expect(
    (
      await developer.request.get(`/api/reports/${report.id}/screenshot`)
    ).status(),
  ).toBe(200);
  await developer.getByLabel("Report status").selectOption("IN_PROGRESS");
  await expect(developer.getByLabel("Report status")).toHaveValue(
    "IN_PROGRESS",
  );
  expect(
    (
      await developer.request.delete(`/api/reports/${report.id}`, { headers })
    ).status(),
  ).toBe(404);
  expect(
    (
      await developer.request.patch(`/api/projects/${project.id}`, {
        headers,
        data: { name: "Takeover", origins: [origin] },
      })
    ).status(),
  ).toBe(404);
  expect(
    (await developer.request.get(`/api/teams/${project.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await developer.request.post("/api/invitations", {
        headers,
        data: { token: new URL(link).hash.slice(1) },
      })
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Manage project team" }).click();
  await page.getByRole("button", { name: "Manage project team" }).click();
  await page.getByRole("button", { name: "Remove developer" }).click();
  await expect(
    page.getByRole("button", { name: "Remove developer" }),
  ).toHaveCount(0);
  expect(
    (await developer.request.get(`/api/reports/${report.id}`)).status(),
  ).toBe(404);
  expect(
    (
      await developer.request.patch(`/api/reports/${report.id}`, {
        headers,
        data: { status: "RESOLVED" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await developer.request.get(`/api/reports/${report.id}/screenshot`)
    ).status(),
  ).toBe(404);
  await context.close();
});
