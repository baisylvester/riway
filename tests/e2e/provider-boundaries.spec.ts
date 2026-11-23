import { test, expect } from "@playwright/test";
test("store management redirects signed-out visitors", async ({ page }) => {
  await page.goto("/operations");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.locator('form input[type="email"]')).toBeVisible();
});
test("provider endpoints reject unconfigured delivery and untrusted referral writes", async ({
  request,
}) => {
  expect(
    (await request.post("/api/webhooks/clerk", { data: {} })).status(),
  ).toBe(503);
  expect(
    (await request.post("/api/internal/notifications", { data: {} })).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/referral", {
        headers: { origin: "https://untrusted.example" },
        data: { code: "TEST" },
      })
    ).status(),
  ).toBe(403);
});
