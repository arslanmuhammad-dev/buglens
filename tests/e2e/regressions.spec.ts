import type { Page, Response } from "@playwright/test";
import { test, expect } from "./fixtures";

const origin = "http://127.0.0.1:3000";
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function login(page: Page) {
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: {
      name: "Race tester",
      email: `race-${crypto.randomUUID()}@example.test`,
      password: "regression-password-123",
    },
  });
  expect(response.ok()).toBeTruthy();
  const project = await (
    await page.request.post("/api/projects", {
      headers: { origin },
      data: { name: "Race test", origins: [origin] },
    })
  ).json();
  for (const title of ["First race report", "Second race report"]) {
    const created = await page.request.post("/api/ingest", {
      headers: { origin },
      data: {
        projectKey: project.key,
        title,
        description: "Isolated test data",
        steps: "",
        expected: "",
        pageUrl: origin,
        browser: "Chrome",
        viewport: "1280x720",
        events: [],
      },
    });
    expect(created.status()).toBe(201);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The whole picture." }),
  ).toBeVisible();
  return (await (await page.request.get("/api/reports")).json()).reports as {
    id: string;
    title: string;
  }[];
}
async function hold(page: Page, id: string, method = "GET") {
  const started = deferred(),
    gate = deferred();
  await page.route(origin + "/api/reports/" + id, async (route) => {
    if (route.request().method() === method) {
      started.release();
      await gate.promise;
    }
    await route.continue();
  });
  return { started: started.promise, release: gate.release };
}
async function consumedAndPainted(page: Page, response: Response) {
  await response.finished();
  // Let the completed fetch reach React and paint; no timing-based sleep.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("late report response cannot replace the most recently selected report", async ({
  page,
}) => {
  const [first, second] = await login(page);
  const held = await hold(page, first.id);
  try {
    await page.getByRole("button", { name: first.title, exact: true }).click();
    await held.started;
    await page.getByRole("button", { name: second.title, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: second.title, exact: true }),
    ).toBeVisible();
    const response = page.waitForResponse(origin + "/api/reports/" + first.id);
    held.release();
    await consumedAndPainted(page, await response);
    await expect(
      page.getByRole("heading", { name: second.title, exact: true }),
    ).toBeVisible();
  } finally {
    held.release();
  }
});

test("leaving report navigation invalidates its pending detail response", async ({
  page,
}) => {
  const [first] = await login(page);
  const held = await hold(page, first.id);
  try {
    await page.getByRole("button", { name: first.title, exact: true }).click();
    await held.started;
    await page.getByRole("button", { name: "Projects" }).click();
    await expect(
      page.getByRole("heading", { name: "Your projects." }),
    ).toBeVisible();
    const response = page.waitForResponse(origin + "/api/reports/" + first.id);
    held.release();
    await consumedAndPainted(page, await response);
    await expect(
      page.getByRole("heading", { name: "Your projects." }),
    ).toBeVisible();
  } finally {
    held.release();
  }
});

test("finishing a status update cannot reopen a report after navigating away", async ({
  page,
}) => {
  const [first] = await login(page);
  await page.getByRole("button", { name: first.title, exact: true }).click();
  const held = await hold(page, first.id, "PATCH");
  try {
    await page.getByLabel("Report status").selectOption("IN_PROGRESS");
    await held.started;
    await page.getByRole("button", { name: "Projects" }).click();
    await expect(
      page.getByRole("heading", { name: "Your projects." }),
    ).toBeVisible();
    const refreshed = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().startsWith(origin + "/api/reports?"),
    );
    held.release();
    await consumedAndPainted(page, await refreshed);
    await expect(
      page.getByRole("heading", { name: "Your projects." }),
    ).toBeVisible();
  } finally {
    held.release();
  }
});

test("removing a screenshot clears invalid annotation controls and permits sending", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Screenshot removed after editing");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("A report without an image must remain usable.");
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  await expect(page.getByLabel("Screenshot annotation canvas")).toBeVisible();
  await page.getByLabel("X", { exact: true }).fill("-1");
  await page
    .getByRole("button", { name: "Remove screenshot", exact: true })
    .click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Capture screenshot", exact: true }),
  ).toBeVisible();
});

test("mask collection failure restores the form and screenshot-free reporting", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Capture preparation failed");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Keep this description after a capture failure.");
  await page.locator("[data-buglens-private]").evaluate((element) => {
    element.getBoundingClientRect = () => {
      throw Error("Controlled masking preparation failure");
    };
  });
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Screenshot capture failed" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title *", { exact: true })).toHaveValue(
    "Capture preparation failed",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Report sent" }),
  ).toBeVisible();
});

test("signing into another account starts with clean workspace filters", async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const email = `switch-${crypto.randomUUID()}@example.test`;
  const password = "regression-password-123";
  try {
    expect(
      (
        await other.request.post(origin + "/api/auth/sign-up/email", {
          headers: { origin },
          data: { name: "Other tester", email, password },
        })
      ).ok(),
    ).toBeTruthy();
    const project = await (
      await other.request.post(origin + "/api/projects", {
        headers: { origin },
        data: { name: "Other workspace", origins: [origin] },
      })
    ).json();
    expect(
      (
        await other.request.post(origin + "/api/ingest", {
          headers: { origin },
          data: {
            projectKey: project.key,
            title: "New account report",
            description:
              "This medium-severity report belongs to the second account.",
            steps: "",
            expected: "",
            pageUrl: origin,
            browser: "Chrome",
            viewport: "1280x720",
            events: [],
          },
        })
      ).status(),
    ).toBe(201);
    await login(page);
    await page.getByLabel("Filter severity").selectOption("HIGH");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "New account report", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Filter severity")).toHaveValue("");
  } finally {
    await other.close();
  }
});

test("a completed mutation refreshes the current report filters", async ({
  page,
}) => {
  const [first, second] = await login(page);
  await page.getByRole("button", { name: first.title, exact: true }).click();
  const held = await hold(page, first.id, "PATCH");
  try {
    await page.getByLabel("Report status").selectOption("IN_PROGRESS");
    await held.started;
    await page.getByRole("button", { name: "All reports" }).click();
    const filtered = page.waitForResponse(
      (r) =>
        r.url().startsWith(origin + "/api/reports?") &&
        new URL(r.url()).searchParams.get("q") === second.title,
    );
    await page.getByLabel("Search reports").fill(second.title);
    await consumedAndPainted(page, await filtered);
    await expect(
      page.getByRole("button", { name: second.title, exact: true }),
    ).toBeVisible();
    const refreshed = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        r.url().startsWith(origin + "/api/reports?"),
    );
    held.release();
    await consumedAndPainted(page, await refreshed);
    await expect(page.getByLabel("Search reports")).toHaveValue(second.title);
    await expect(
      page.getByRole("button", { name: second.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: first.title, exact: true }),
    ).toHaveCount(0);
  } finally {
    held.release();
  }
});
