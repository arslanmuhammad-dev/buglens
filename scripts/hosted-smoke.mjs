import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { get as getBlob } from "@vercel/blob";
const base = process.env.BUGLENS_LIVE_URL;
if (process.env.RUN_HOSTED_CHECKS !== "1" || !base?.startsWith("https://"))
  throw Error(
    "Set RUN_HOSTED_CHECKS=1 and the exact HTTPS BUGLENS_LIVE_URL for the dedicated test deployment",
  );
const db = new PrismaClient();
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const createdReports = [];
let publicReportId;
const emails = [
  `live-${randomUUID()}@example.test`,
  `other-live-${randomUUID()}@example.test`,
];
const password = randomUUID() + "Aa1!";
const artifacts = path.join(tmpdir(), "buglens-hosted-review");
await mkdir(artifacts, { recursive: true });
let screenshotKey;
const origin = new URL(base).origin;
const check = (condition, message) => {
  assert.ok(condition, message);
  console.log("PASS " + message);
};
try {
  await page.goto(base);
  const shareImage = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  check(
    new URL(shareImage).origin === origin,
    "share image uses canonical production origin",
  );
  const share = await context.request.get(shareImage);
  const shareMeta = await sharp(await share.body()).metadata();
  check(
    share.ok() && shareMeta.width === 1200 && shareMeta.height === 630,
    "public social preview is a valid 1200x630 image",
  );
  check(
    (await context.request.get("/icon.svg")).ok(),
    "branded favicon is public",
  );
  await page.goto(base + "/demo");
  await expect(
    page.getByText("Reports go to a shared demo workspace.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Anonymous public demo verification");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Fake-data public demo smoke test");
  const publicSubmission = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/ingest" && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toContainText("Report sent");
  const publicResponse = await publicSubmission;
  publicReportId = (await publicResponse.json()).id;
  check(
    publicResponse.status() === 201 && Boolean(publicReportId),
    "anonymous public demo accepts a screenshot-free report",
  );
  await page.goto(base);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Live verification");
  await page.getByLabel("Email address").fill(emails[0]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.getByRole("heading", { name: "The whole picture." }).waitFor();
  console.log("PASS HTTPS signup and authenticated session");
  await page.goto(base + "/demo");
  await expect(
    page.getByRole("button", { name: "Connect demo to my workspace" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  console.log(
    "PASS unconnected signed-in demo cannot submit to the shared owner",
  );
  await page.goto(base);
  await page.getByRole("heading", { name: "The whole picture." }).waitFor();
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Live verification store");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.locator(".snippet").waitFor();
  check(
    (await page.locator(".snippet").innerText()).includes(
      origin + "/widget.js",
    ),
    "installation snippet uses canonical HTTPS origin",
  );
  const [project] = await (await context.request.get("/api/projects")).json();
  await page.goto(base + "/demo");
  await page.getByText("Reports go to your project:").waitFor();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Live hosted checkout verification");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Fake-data hosted smoke test");
  await page.getByText("Preview exact report payload").click();
  await page.locator("#preview").filter({ hasText: "503" }).waitFor();
  console.log("PASS failed request appears in live diagnostics");
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  const canvas = page.getByLabel("Screenshot annotation canvas");
  await canvas.waitFor();
  await page.getByLabel("Annotation", { exact: true }).selectOption("redact");
  await page.getByRole("button", { name: "Apply annotation" }).click();
  const accepted = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/ingest" && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  await page.getByRole("status").filter({ hasText: "Report sent" }).waitFor();
  const submission = await accepted;
  check(submission.status() === 201, "live screenshot report accepted");
  const { id } = await submission.json();
  createdReports.push(id);
  const report = await db.report.findUniqueOrThrow({
    where: { id },
    include: { screenshot: true },
  });
  screenshotKey = report.screenshot.filename;
  check(
    screenshotKey.startsWith("buglens/"),
    "screenshot persisted in private Blob storage",
  );
  const image = await context.request.get("/api/reports/" + id + "/screenshot");
  check(image.status() === 200, "owner can retrieve stored screenshot");
  const pixels = await sharp(await image.body())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (30 * pixels.info.width + 30) * 4;
  check(
    JSON.stringify([...pixels.data.subarray(offset, offset + 4)]) ===
      "[0,0,0,255]",
    "opaque redaction survives hosted upload and image export",
  );
  const blob = await getBlob(screenshotKey, { access: "private" });
  check(blob?.statusCode === 200, "actual private Blob exists");
  if (blob?.statusCode === 200) {
    await blob.stream.cancel();
    const direct = await fetch(blob.blob.url);
    check(
      [401, 403, 404].includes(direct.status),
      "private Blob rejects unauthenticated direct delivery",
    );
  }
  const other = await browser.newContext({ baseURL: base });
  const otherSignup = await other.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      name: "Other live tester",
      email: emails[1],
      password: randomUUID() + "Aa1!",
    },
  });
  check(otherSignup.ok(), "separate hosted test account created");
  check(
    (await other.request.get("/api/reports/" + id)).status() === 404,
    "other user cannot read report",
  );
  check(
    (await other.request.get("/api/reports/" + id + "/screenshot")).status() ===
      404,
    "other user cannot retrieve actual screenshot",
  );
  check(
    (
      await other.request.patch("/api/reports/" + id, {
        headers: { origin },
        data: { status: "RESOLVED" },
      })
    ).status() === 404,
    "other user cannot mutate report",
  );
  await other.close();
  await page.goto(base);
  await page.getByRole("button", { name: "Bug reports" }).click();
  await page
    .getByRole("button", {
      name: "Live hosted checkout verification",
      exact: true,
    })
    .click();
  await page.getByLabel("Report status").selectOption("RESOLVED");
  await expect(page.getByLabel("Report status")).toBeEnabled();
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await page
    .getByLabel("Note", { exact: true })
    .fill("Verified in the real Vercel deployment");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByText("Verified in the real Vercel deployment", { exact: true })
    .waitFor();
  const saved = await (await context.request.get("/api/reports/" + id)).json();
  check(
    saved.status === "RESOLVED" && saved.notes.length === 1,
    "triage and notes persist in hosted PostgreSQL",
  );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Live hosted checkout verification",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Report status")).toHaveValue("RESOLVED");
  await expect(
    page.getByText("Verified in the real Vercel deployment", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByAltText("Reporter’s annotated screenshot"),
  ).toHaveJSProperty("complete", true);
  await expect(
    page.getByAltText("Reporter’s annotated screenshot"),
  ).not.toHaveJSProperty("naturalWidth", 0);
  await page.screenshot({ path: artifacts + "/dashboard.png", fullPage: true });
  console.log("PASS hosted triage and notes survive browser reload");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(
    page.getByText("Verified in the real Vercel deployment", { exact: true }),
  ).toHaveCount(0);

  // Exercise the deployed IIFE and CORS endpoint from a genuinely different origin.
  const host = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Independent BugLens host</h1><input value="HOST_VALUE_SECRET"><script src="${origin}/widget.js" data-project-key="${project.key}" defer></script></body></html>`,
    );
  });
  await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
  try {
    const hostOrigin = `http://127.0.0.1:${host.address().port}`;
    check(
      (
        await context.request.patch("/api/projects/" + project.id, {
          headers: { origin },
          data: { name: project.name, origins: [origin, hostOrigin] },
        })
      ).ok(),
      "owned project origin settings persist",
    );
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const mobilePage = await mobile.newPage();
      await mobilePage.goto(
        hostOrigin + "/?token=URL_VALUE_SECRET#PRIVATE_FRAGMENT",
      );
      await mobilePage
        .getByRole("button", { name: "Report a problem", exact: true })
        .click();
      await mobilePage
        .getByLabel("Title *", { exact: true })
        .fill("Mobile external host");
      await mobilePage
        .getByLabel("Description *", { exact: true })
        .fill("Hosted mobile core workflow without screenshot");
      const accepted = mobilePage.waitForResponse(
        (r) =>
          r.url() === origin + "/api/ingest" && r.request().method() === "POST",
      );
      await mobilePage.screenshot({
        path: artifacts + "/mobile-widget.png",
        fullPage: true,
      });
      await mobilePage.getByRole("button", { name: "Send report" }).click();
      await expect(mobilePage.getByRole("status")).toContainText("Report sent");
      const received = await accepted;
      const raw = received.request().postData();
      for (const secret of [
        "HOST_VALUE_SECRET",
        "URL_VALUE_SECRET",
        "PRIVATE_FRAGMENT",
      ])
        check(
          !raw.includes(secret),
          "actual hosted payload excludes " + secret,
        );
      createdReports.push((await received.json()).id);
      check(
        received.status() === 201,
        "mobile external-origin widget submits without screenshot",
      );
    } finally {
      await mobile.close();
    }
  } finally {
    await new Promise((resolve, reject) =>
      host.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const payload = {
    projectKey: project.key,
    title: "Rejected request",
    description: "Fake data",
    steps: "",
    expected: "",
    pageUrl: origin,
    browser: "Chrome",
    viewport: "390x844",
    events: [],
  };
  check(
    (
      await context.request.post("/api/ingest", {
        headers: { origin: "https://disallowed.example" },
        data: payload,
      })
    ).status() === 403,
    "hosted ingestion rejects disallowed origins",
  );
  check(
    (
      await context.request.post("/api/ingest", {
        headers: { origin },
        data: { ...payload, projectKey: "invalid-live-key" },
      })
    ).status() === 403,
    "hosted ingestion rejects invalid project keys",
  );
  check(
    (
      await context.request.post("/api/ingest", {
        headers: { origin, "content-type": "application/json" },
        data: "{",
      })
    ).status() === 400,
    "hosted malformed JSON returns controlled error",
  );
  check(
    (
      await context.request.post("/api/ingest", {
        headers: { origin, "content-type": "application/json" },
        data: "x".repeat(3_000_001),
      })
    ).status() === 413,
    "hosted oversized payload returns controlled error",
  );
  const deletion = await context.request.delete("/api/reports/" + id, {
    headers: { origin },
  });
  check(deletion.status() === 200, "report deletion succeeds");
  createdReports.splice(createdReports.indexOf(id), 1);
  check(
    (
      await context.request.get("/api/reports/" + id + "/screenshot")
    ).status() === 404,
    "deleted screenshot route is unavailable",
  );
  let missing = false;
  try {
    const deleted = await getBlob(screenshotKey, {
      access: "private",
      useCache: false,
    });
    missing = deleted === null;
  } catch (e) {
    missing = e?.name === "BlobNotFoundError";
  }
  check(missing, "actual private Blob is removed on report deletion");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  check(
    (await context.request.get("/api/projects")).status() === 401,
    "logout invalidates hosted authenticated session",
  );
  await page.getByLabel("Email address").fill(emails[0]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "The whole picture." }).waitFor();
  console.log("PASS hosted login after logout");
  console.log("Hosted acceptance checks completed. Only fake data was used.");
} catch (error) {
  await page
    .screenshot({ path: artifacts + "/failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  if (publicReportId)
    await db.report.deleteMany({
      where: {
        id: publicReportId,
        project: { key: "buglens-demo-public" },
        screenshot: null,
      },
    });
  for (const id of createdReports)
    await context.request
      .delete("/api/reports/" + id, { headers: { origin } })
      .catch(() => {});
  // Only users created by this particular run are eligible for cleanup.
  // Retain a user if an asset still needs cleanup after a failed API deletion.
  for (const email of emails) {
    const user = await db.user.findUnique({
      where: { email },
      include: {
        projects: { include: { reports: { include: { screenshot: true } } } },
      },
    });
    if (user && !user.projects.some((p) => p.reports.some((r) => r.screenshot)))
      await db.user.delete({ where: { id: user.id } });
  }
  await context.close();
  await browser.close();
  await db.$disconnect();
}
