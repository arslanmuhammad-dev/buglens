import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const origin = "http://127.0.0.1:3000";
const mailbox = process.env.MAILPIT_URL || "http://127.0.0.1:8025";
const headers = { origin };
async function resetEmail(
  request: import("@playwright/test").APIRequestContext,
  email: string,
) {
  let id = "";
  await expect
    .poll(async () => {
      const data = await (
        await request.get(mailbox + "/api/v1/search", {
          params: { query: `to:${email} subject:Reset` },
        })
      ).json();
      id = data.messages?.[0]?.ID || "";
      return Boolean(id);
    })
    .toBe(true);
  return (await (await request.get(mailbox + "/api/v1/message/" + id)).json())
    .Text as string;
}
test.afterAll(() => db.$disconnect());
test("password recovery sends a real local email, consumes token once and revokes sessions", async ({
  page,
  browser,
}) => {
  const email = `recovery-${crypto.randomUUID()}@example.test`,
    oldPassword = "Original-password-123",
    newPassword = "Replacement-password-123";
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Recovery user", email, password: oldPassword },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  const text = await resetEmail(page.request, email);
  const link = text.match(
    /http:\/\/127\.0\.0\.1:3000\/reset-password#[A-Za-z0-9_-]+/,
  )?.[0];
  expect(link).toBeTruthy();
  const context = await browser.newContext({ baseURL: origin });
  const recovery = await context.newPage();
  await recovery.goto(link!);
  await recovery.getByLabel("New password", { exact: true }).fill(newPassword);
  await recovery.getByLabel("Confirm new password").fill("Different-password");
  await recovery.getByRole("button", { name: "Update password" }).click();
  await expect(
    recovery.getByRole("alert").filter({ hasText: "Passwords must match" }),
  ).toBeVisible();
  await recovery.getByLabel("Confirm new password").fill(newPassword);
  await recovery.getByRole("button", { name: "Update password" }).click();
  await expect(recovery.getByRole("status")).toContainText("Password updated");
  expect((await page.request.get("/api/projects")).status()).toBe(401);
  expect(
    (
      await context.request.post("/api/auth/sign-in/email", {
        headers,
        data: { email, password: oldPassword },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await context.request.post("/api/auth/sign-in/email", {
        headers,
        data: { email, password: newPassword },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await context.request.post("/api/auth/reset-password", {
        headers,
        data: {
          token: new URL(link!).hash.slice(1),
          newPassword: "Attempted-reuse-123",
        },
      })
    ).status(),
  ).toBe(400);
  await context.close();
});
test("recovery is generic for unknown accounts, enforces expiry/origin/size and rate limits", async ({
  request,
}) => {
  const email = `expired-${crypto.randomUUID()}@example.test`;
  await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Expiry", email, password: "expiry-password-123" },
  });
  const known = await request.post("/api/recovery", {
    headers,
    data: { email },
  });
  const unknown = await request.post("/api/recovery", {
    headers,
    data: { email: `missing-${crypto.randomUUID()}@example.test` },
  });
  expect(known.status()).toBe(200);
  expect(await unknown.json()).toEqual(await known.json());
  const text = await resetEmail(request, email);
  const token = text.match(/reset-password#([A-Za-z0-9_-]+)/)![1];
  await db.verification.updateMany({
    where: { identifier: "reset-password:" + token },
    data: { expiresAt: new Date(0) },
  });
  expect(
    (
      await request.post("/api/auth/reset-password", {
        headers,
        data: { token, newPassword: "expiry-replacement-123" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/recovery", {
        headers: { origin: "https://evil.test" },
        data: { email },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/recovery", {
        headers,
        data: { email: "x".repeat(1500) },
      })
    ).status(),
  ).toBe(413);
  await db.rateLimitBucket.upsert({
    where: { key: "recovery:global" },
    update: { count: 30, expiresAt: new Date(Date.now() + 60000) },
    create: {
      key: "recovery:global",
      count: 30,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  expect(
    (
      await request.post("/api/recovery", { headers, data: { email } })
    ).status(),
  ).toBe(429);
});
