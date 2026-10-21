import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { readdir } from "node:fs/promises";

test("private areas are masked, exported redaction persists, deletion removes asset", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("demo@buglens.local");
  await page.getByLabel("Password", { exact: true }).fill("BugLens-demo-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The whole picture." }),
  ).toBeVisible();
  await page.goto("/demo");
  const area = page.locator("[data-buglens-private]");
  await area.scrollIntoViewIfNeeded();
  const rect = (await area.boundingBox())!;
  const width = await page.evaluate(() => innerWidth);
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page.getByLabel("Title *", { exact: true }).fill("Pixel verification");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Mask and redaction test");
  await page
    .getByRole("button", { name: "Capture screenshot", exact: true })
    .click();
  const canvas = page.getByLabel("Screenshot annotation canvas");
  await expect(canvas).toBeVisible();
  const pixel = await canvas.evaluate(
    (c: HTMLCanvasElement, args) => {
      const scale = c.width / args.width;
      return Array.from(
        c
          .getContext("2d")!
          .getImageData(
            (args.rect.x + 10) * scale,
            (args.rect.y + 10) * scale,
            1,
            1,
          ).data,
      );
    },
    { rect, width },
  );
  expect(pixel).toEqual([38, 60, 53, 255]);
  await page.getByLabel("Annotation", { exact: true }).selectOption("redact");
  await page.getByRole("button", { name: "Apply annotation" }).click();
  const submitted = page.waitForRequest(
    (r) => r.url().endsWith("/api/ingest") && r.method() === "POST",
  );
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/ingest") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send report" }).click();
  const payload = (await submitted).postDataJSON();
  const image = Buffer.from(payload.screenshot.split(",")[1], "base64");
  const decoded = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (30 * decoded.info.width + 30) * 4;
  expect(Array.from(decoded.data.subarray(offset, offset + 4))).toEqual([
    0, 0, 0, 255,
  ]);
  const id = (await (await response).json()).id;
  expect(id).toBeTruthy();
  const asset = await page.request.get("/api/reports/" + id + "/screenshot");
  expect(asset.status()).toBe(200);
  const ownerImage = await sharp(await asset.body())
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(
    Array.from(
      ownerImage.data.subarray(
        (30 * ownerImage.info.width + 30) * 4,
        (30 * ownerImage.info.width + 30) * 4 + 4,
      ),
    ),
  ).toEqual([0, 0, 0, 255]);
  const other = await browser.newContext();
  await other.request.post("http://127.0.0.1:3000/api/auth/sign-up/email", {
    headers: { origin: "http://127.0.0.1:3000" },
    data: {
      name: "Other",
      email: `pixels-${Date.now()}@example.test`,
      password: "other-user-test-password",
    },
  });
  expect(
    (
      await other.request.get(
        "http://127.0.0.1:3000/api/reports/" + id + "/screenshot",
      )
    ).status(),
  ).toBe(404);
  await other.close();
  const directory = process.env.SCREENSHOT_DIR!;
  const before = await readdir(directory);
  expect(
    (
      await page.request.delete("/api/reports/" + id, {
        headers: { origin: "http://127.0.0.1:3000" },
      })
    ).status(),
  ).toBe(200);
  const after = await readdir(directory);
  expect(after.length).toBe(before.length - 1);
  expect(
    (await page.request.get("/api/reports/" + id + "/screenshot")).status(),
  ).toBe(404);
});
