import { test, expect } from "@playwright/test";
test("catalogue search and bag persist across reload", async ({ page }) => {
  await page.goto("/shop");
  await expect(
    page.getByRole("heading", {
      name: "Discover your everyday extraordinary.",
    }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("purtier");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "PURTIER PLACENTA", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "CONSCIENTIOUS", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "PURTIER PLACENTA", exact: true }),
    })
    .click();
  await page.getByRole("button", { name: "Add to bag for review" }).click();
  await page.getByRole("link", { name: "View bag →" }).click();
  await expect(
    page.getByRole("heading", { name: "PURTIER PLACENTA", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Quantity for PURTIER PLACENTA")).toHaveValue(
    "1",
  );
  await page.getByRole("link", { name: "Review checkout" }).click();
  await expect(
    page.getByText("Sales are closed pending policy and regulatory approvals."),
  ).toBeVisible();
});
test("private areas require sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/login/);
});
test("forged origins cannot mutate market", async ({ request }) => {
  const r = await request.post("/api/market", {
    headers: { origin: "https://untrusted.example" },
    data: { market: "SG" },
  });
  expect(r.status()).toBe(403);
});
test("public pages fit the viewport", async ({ page }) => {
  for (const path of [
    "/",
    "/shop",
    "/about",
    "/membership",
    "/stories",
    "/events",
    "/support",
    "/legal",
    "/auth/login",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
