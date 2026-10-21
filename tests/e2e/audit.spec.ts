import { test, expect } from "./fixtures";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
const origin = "http://127.0.0.1:3000";
async function signIn(request: import("@playwright/test").APIRequestContext) {
  const result = await request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email: "demo@buglens.local", password: "BugLens-demo-2026" },
  });
  expect(result.ok()).toBeTruthy();
}
test("strict routing and malformed requests cannot mutate reports", async ({
  request,
}) => {
  await signIn(request);
  const headers = { origin, "content-type": "application/json" };
  expect((await request.get("/api/reports?page=1.5")).status()).toBe(400);
  expect((await request.get("/api/reports?status=INVALID")).status()).toBe(400);
  expect(
    (await request.get("/api/reports/demo-report-0/unknown")).status(),
  ).toBe(404);
  expect(
    (
      await request.delete("/api/reports/demo-report-0/screenshot", { headers })
    ).status(),
  ).toBe(405);
  expect(
    (
      await request.patch("/api/reports/demo-report-0/notes", {
        headers,
        data: { status: "RESOLVED" },
      })
    ).status(),
  ).toBe(405);
  expect(
    (
      await request.patch("/api/reports/demo-report-0", { headers, data: "{" })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.patch("/api/reports/demo-report-0", { headers, data: {} })
    ).status(),
  ).toBe(400);
  const before = await (await request.get("/api/reports/demo-report-0")).json();
  expect(before.status).toBe("OPEN");
  const malformed = await request.post("/api/ingest", { headers, data: "{" });
  expect(malformed.status()).toBe(400);
  expect(malformed.headers()["access-control-allow-origin"]).toBe(origin);
});
test("dashboard preserves a failed note and exposes retry errors", async ({
  page,
}) => {
  await signIn(page.request);
  await page.goto("/");
  await page
    .getByLabel("Search reports")
    .fill("Checkout fails when placing an order");
  await page
    .getByRole("button", {
      name: "Checkout fails when placing an order",
      exact: true,
    })
    .click();
  await page.getByLabel("Note", { exact: true }).fill("Preserve my note");
  await page.route("**/api/reports/demo-report-0/notes", (route) =>
    route.fulfill({ status: 503, json: { error: "Controlled note failure" } }),
  );
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Controlled note failure" }),
  ).toContainText("Controlled note failure");
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue(
    "Preserve my note",
  );
});
test("new account demo report belongs to its own workspace and retry is idempotent", async ({
  page,
}) => {
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      name: "Audit owner",
      email: `audit-${crypto.randomUUID()}@example.test`,
      password: "audit-test-password-123",
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect demo to my workspace" })
    .click();
  await expect(page.getByText("Reports go to your project:")).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page.getByLabel("Title *", { exact: true }).fill("Owned demo checkout");
  await page.getByLabel("Description *", { exact: true }).fill("My own report");
  let lost = true;
  await page.route("**/api/ingest", async (route) => {
    const response = await route.fetch();
    if (lost) {
      lost = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Could not send");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Report sent");
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Owned demo checkout", exact: true }),
  ).toHaveCount(1);
  const listing = await (await page.request.get("/api/reports")).json();
  expect(listing.total).toBe(1);
});
test("workspace lookup failure cannot silently route reports to the public demo", async ({
  page,
}) => {
  await page.route("**/api/projects", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Controlled workspace failure" },
    }),
  );
  await page.goto("/demo");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "could not verify your reporting workspace" }),
  ).toContainText("could not verify your reporting workspace");
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/projects");
  await page.getByRole("button", { name: "Reload demo", exact: true }).click();
  await expect(
    page.getByText("Reports go to a shared demo workspace.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toBeVisible();
});
test("real cross-origin embed captures fetch, XHR and errors without leaking host inputs", async ({
  page,
}) => {
  await signIn(page.request);
  let key = "";
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/broken")) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end("{}");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<html><body><h1>Independent host</h1><label>Secret<input aria-label="Secret" value="HOST_INPUT_SECRET"></label><button onclick="fetch('/broken?token=URL_SECRET')">Fail fetch</button><button onclick="const x=new XMLHttpRequest();x.open('POST','/broken?auth=XHR_SECRET');x.send('PRIVATE_BODY')">Fail XHR</button><button onclick="setTimeout(()=>{throw new Error('Controlled host error')},0)">Fail JS</button><script src="${origin}/widget.js" data-project-key="${key}" defer></script></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const project = await (
      await page.request.post("/api/projects", {
        headers: { origin },
        data: { name: "Independent host", origins: [host] },
      })
    ).json();
    key = project.key;
    expect(key).toBeTruthy();
    await page.goto(host);
    await expect(
      page.getByRole("button", { name: "Report a problem", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fail fetch", exact: true }).click();
    await page.getByRole("button", { name: "Fail XHR", exact: true }).click();
    await page.getByRole("button", { name: "Fail JS", exact: true }).click();
    await page
      .getByRole("button", { name: "Report a problem", exact: true })
      .click();
    await page
      .getByLabel("Title *", { exact: true })
      .fill("Cross-origin report");
    await page
      .getByLabel("Description *", { exact: true })
      .fill("From a separate website");
    await page.getByText("Preview exact report payload").click();
    await expect(page.locator("#preview")).toContainText(
      "Controlled host error",
    );
    await expect(page.locator("#preview")).toContainText("POST");
    const submitted = page.waitForRequest(
      (r) => r.url() === origin + "/api/ingest" && r.method() === "POST",
    );
    await page.getByRole("button", { name: "Send report" }).click();
    const request = await submitted;
    const raw = request.postData()!;
    for (const secret of [
      "HOST_INPUT_SECRET",
      "URL_SECRET",
      "XHR_SECRET",
      "PRIVATE_BODY",
    ])
      expect(raw).not.toContain(secret);
    const events = request.postDataJSON().events;
    expect(
      events.filter((e: { type: string }) => e.type === "request"),
    ).toHaveLength(2);
    await expect(page.getByRole("status")).toContainText("Report sent");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test("collector teardown restores native wrappers and tolerates frozen host APIs", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    document
      .getElementById("buglens-widget-root")!
      .dispatchEvent(new Event("buglens:destroy"));
  });
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(history, "pushState", {
      value: history.pushState,
      writable: false,
      configurable: true,
    });
  });
  await page.addScriptTag({
    url: origin + "/widget.js",
    "data-project-key": "buglens-demo-public",
  } as Parameters<typeof page.addScriptTag>[0]);
  // Explicitly mount the exported standalone factory, without altering the host's frozen method.
  await page.evaluate(() => {
    const api = (
      window as unknown as {
        BugLens: {
          mount: (key: string, base: string) => { destroy: () => void };
        };
      }
    ).BugLens;
    const instance = api.mount("buglens-demo-public", location.origin);
    instance.destroy();
  });
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toHaveCount(0);
});
test("authentication rate limit rejects repeated login attempts", async ({
  request,
}) => {
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await request.post("/api/auth/sign-in/email", {
      headers: { origin },
      data: {
        email: "not-a-user@example.test",
        password: "incorrect-password-123",
      },
    });
    codes.push(r.status());
  }
  expect(codes.at(-1)).toBe(429);
});
