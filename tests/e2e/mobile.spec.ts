import { test, expect } from "./fixtures";
test("mobile core reporting", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await page
    .getByLabel("Title *", { exact: true })
    .fill("Mobile checkout failure");
  await page
    .getByLabel("Description *", { exact: true })
    .fill("Failed order from phone");
  await page.getByText("Preview exact report payload").click();
  await expect(page.locator("#preview")).toContainText("503");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").last()).toContainText("Report sent");
});
