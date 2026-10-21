import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const base = process.env.BUGLENS_LIVE_URL;
if (process.env.RUN_HOSTED_CHECKS !== "1" || !base?.startsWith("https://"))
  throw Error(
    "Set RUN_HOSTED_CHECKS=1 and an exact HTTPS BUGLENS_LIVE_URL; never resets a database.",
  );
const origin = new URL(base).origin;
const headers = { origin };
const db = new PrismaClient();
const browser = await chromium.launch();
const owner = await browser.newContext({
  baseURL: base,
  viewport: { width: 1280, height: 900 },
});
const reporter = await browser.newContext({
  baseURL: base,
  viewport: { width: 390, height: 844 },
});
const developer = await browser.newContext({ baseURL: base });
const emails = [
  `communication-live-${randomUUID()}@example.test`,
  `developer-live-${randomUUID()}@example.test`,
];
const artifacts = path.join(tmpdir(), "buglens-communication-review");
await mkdir(artifacts, { recursive: true });
const check = (condition, text) => {
  assert.ok(condition, text);
  console.log("PASS " + text);
};
let projectId;
async function signup(context, email) {
  const response = await context.request.post("/api/auth/sign-up/email", {
    headers,
    data: {
      name: "Hosted communication test",
      email,
      password: randomUUID() + "Aa1!",
    },
  });
  check(response.ok(), "HTTPS signup for isolated verification account");
}
try {
  await signup(owner, emails[0]);
  await signup(developer, emails[1]);
  const created = await owner.request.post("/api/projects", {
    headers,
    data: { name: "Hosted customer follow-up", origins: [origin] },
  });
  check(created.status() === 201, "owner can create project");
  const project = await created.json();
  projectId = project.id;
  const page = await owner.newPage();
  page.setDefaultTimeout(45000);
  await page.goto(base + "/demo");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Hosted customer conversation");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Fake checkout issue for release verification");
  await page.getByLabel("Your name", { exact: true }).fill("Fake customer");
  await page
    .getByLabel("Your email", { exact: true })
    .fill("fake-customer@example.test");
  await page.getByRole("button", { name: "Send report" }).click();
  const link = page.getByRole("link", {
    name: "Open your private report conversation",
  });
  await expect(link).toBeVisible();
  const trackingUrl = await link.getAttribute("href");
  const id = new URL(trackingUrl).pathname.split("/").at(-1);
  const token = new URL(trackingUrl).hash.slice(1);
  check(
    token.length === 43 && new URL(trackingUrl).search === "",
    "widget returns private fragment-based tracking capability",
  );
  const stored = await db.report.findUniqueOrThrow({ where: { id } });
  check(
    stored.trackingHash !== token && stored.trackingHash.length === 64,
    "database stores capability hash only",
  );
  const customer = await reporter.newPage();
  await customer.goto(trackingUrl);
  await expect(
    customer.getByRole("heading", { name: "Hosted customer conversation" }),
  ).toBeVisible();
  await customer
    .getByLabel("Public reply")
    .fill("Can you confirm when checkout is fixed?");
  await customer.getByRole("button", { name: "Send public reply" }).click();
  await expect(
    customer.getByText("Can you confirm when checkout is fixed?", {
      exact: true,
    }),
  ).toBeVisible();
  check(true, "mobile customer can follow up without signing up");
  const trackingHeaders = { Authorization: "Bearer " + token };
  const publicData = await (
    await reporter.request.get(`/api/track/${id}`, { headers: trackingHeaders })
  ).json();
  for (const field of [
    "events",
    "notes",
    "screenshot",
    "reporterEmail",
    "trackingHash",
  ])
    check(!(field in publicData), "tracking excludes " + field);
  check(
    (await reporter.request.get(`/api/reports/${id}/screenshot`)).status() ===
      401,
    "tracking does not grant screenshot access",
  );
  check(
    (await reporter.request.get(`/api/track/${id}`)).status() === 404,
    "tracking requires full capability",
  );
  const notifications = await (
    await owner.request.get("/api/notifications")
  ).json();
  check(
    notifications.unread >= 2 &&
      notifications.items.some((n) => n.kind === "CUSTOMER_REPLY"),
    "owner receives persisted new-report and customer-reply notifications",
  );
  await page.goto(base);
  await page
    .getByRole("button", { name: "Hosted customer conversation", exact: true })
    .click();
  await page
    .getByLabel("Note", { exact: true })
    .fill("FAKE_INTERNAL_RELEASE_NOTE");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByLabel("Public reply")
    .fill("Checkout is fixed. Please try again.");
  await page.getByRole("button", { name: "Send public reply" }).click();
  await expect(
    page.getByText("Checkout is fixed. Please try again.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Report status").selectOption("RESOLVED");
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await customer.reload();
  await expect(
    customer.getByText("Checkout is fixed. Please try again.", { exact: true }),
  ).toBeVisible();
  await expect(customer.getByText("FAKE_INTERNAL_RELEASE_NOTE")).toHaveCount(0);
  check(
    true,
    "developer public reply and resolved status reach customer; internal note stays private",
  );
  await customer.screenshot({
    path: path.join(artifacts, "mobile-tracking.png"),
    fullPage: true,
  });
  check(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "tracking fits mobile viewport",
  );
  await customer
    .getByRole("button", { name: "Still happening? Reopen report" })
    .click();
  await expect(
    customer.getByRole("button", { name: "Still happening? Reopen report" }),
  ).toHaveCount(0);
  check(
    (await (await owner.request.get(`/api/reports/${id}`)).json()).status ===
      "OPEN",
    "customer reopening persists in dashboard",
  );
  const inviteResponse = await owner.request.post(
    `/api/teams/${projectId}/invites`,
    { headers, data: { email: emails[1] } },
  );
  const invite = await inviteResponse.json();
  check(inviteResponse.status() === 201, "owner can invite developer");
  const member = await developer.newPage();
  await member.goto(invite.link);
  await member
    .getByRole("button", { name: "Accept developer invitation" })
    .click();
  await expect(member.getByRole("status")).toContainText(
    "You joined Hosted customer follow-up",
  );
  check(
    (await developer.request.get(`/api/reports/${id}`)).status() === 200,
    "accepted developer can read project report",
  );
  check(
    (
      await developer.request.patch(`/api/reports/${id}`, {
        headers,
        data: { status: "IN_PROGRESS" },
      })
    ).ok(),
    "developer can triage",
  );
  check(
    (
      await developer.request.delete(`/api/reports/${id}`, { headers })
    ).status() === 404,
    "developer cannot delete reports",
  );
  check(
    (
      await developer.request.patch(`/api/projects/${projectId}`, {
        headers,
        data: { name: "Not allowed", origins: [origin] },
      })
    ).status() === 404,
    "developer cannot change project settings",
  );
  const team = await (
    await owner.request.get(`/api/teams/${projectId}`)
  ).json();
  await owner.request.delete(
    `/api/teams/${projectId}/members?id=${team.members[0].id}`,
    { headers },
  );
  check(
    (await developer.request.get(`/api/reports/${id}`)).status() === 404,
    "removed developer immediately loses API access",
  );
  await owner.request.delete(`/api/reports/${id}/tracking`, { headers });
  check(
    (
      await reporter.request.get(`/api/track/${id}`, {
        headers: trackingHeaders,
      })
    ).status() === 404,
    "owner can revoke reporter tracking",
  );
  check(
    (await owner.request.delete(`/api/reports/${id}`, { headers })).ok(),
    "owner can delete report",
  );
  check(
    (await db.reportMessage.count({ where: { reportId: id } })) === 0 &&
      (await db.notification.count({ where: { reportId: id } })) === 0,
    "deletion removes conversation and notifications",
  );
} finally {
  // Only the exact UUID-based fake accounts/project created by this run are removed.
  if (projectId)
    await db.project.deleteMany({
      where: { id: projectId, owner: { email: emails[0] } },
    });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await browser.close();
  await db.$disconnect();
}
