import { test, expect } from "@playwright/test";

test("goals support keyboard selection and semantic expansion", async ({
  page,
}) => {
  await page.goto("/");
  const first = page.locator(".rw-wheel button").first();
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".rw-wheel button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#rw-goal-caption")).toContainText(
    "Care for the everyday.",
  );
  const goal = page.locator(".rw-goals-list button").first();
  await goal.click();
  await expect(goal).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#goal-0")).toBeVisible();
  await goal.click();
  await expect(page.locator("#goal-0")).toBeHidden();
});

test("market changes refresh product context and failures are announced", async ({
  page,
}) => {
  await page.goto("/shop/purtier-placenta");
  await page.getByLabel("Select country").selectOption("SG");
  await expect(page.locator(".product-detail")).toContainText("Singapore");
  await page.reload();
  await expect(page.getByLabel("Select country")).toHaveValue("SG");
  await page.getByLabel("Select country").selectOption("MY");
  await expect(page.locator(".product-detail")).toContainText("Malaysia");
  await page.route("**/api/market", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.getByLabel("Select country").selectOption("PH");
  await expect(page.getByRole("status")).toContainText(
    "Your country could not be changed",
  );
});

test("category, empty results, quantities and removal retain their behavior", async ({
  page,
}) => {
  await page.goto("/shop?category=Skincare");
  await expect(page.locator(".result-count")).toHaveText("1 collection");
  await expect(
    page.getByRole("heading", { name: "CONSCIENTIOUS", exact: true }),
  ).toBeVisible();
  await page.goto("/shop?q=no-such-collection");
  await expect(
    page.getByRole("heading", { name: "No matching collections" }),
  ).toBeVisible();
  await page.goto("/shop/conscientious");
  await page.getByRole("button", { name: "Add to bag for review" }).click();
  await page.getByRole("link", { name: "View bag →" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  const quantity = page.getByLabel("Quantity for CONSCIENTIOUS");
  await quantity.fill("3");
  await page.reload();
  await expect(quantity).toHaveValue("3");
  await quantity.fill("25");
  await quantity.blur();
  await expect(quantity).toHaveValue("3");
  await page
    .getByRole("button", { name: "Remove CONSCIENTIOUS", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("Your bag is waiting for a discovery."),
  ).toBeVisible();
  await page.goto("/shop/not-a-published-product");
  await expect(
    page.getByRole("heading", { name: "A different path awaits." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to bag for review" }),
  ).toHaveCount(0);
});

test("reduced motion keeps imagery and product actions immediately available", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".rw-hero .rw-stage-fallback")).toBeVisible();
  await expect(page.locator(".rw-stage canvas")).toHaveCount(0);
  await page.goto("/shop/conscientious");
  await expect(
    page.getByRole("button", { name: "Add to bag for review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "For her", exact: true }).click();
  await expect(page.locator(".rw-theme")).toHaveClass(/rw-theme-her/);
  await expect(
    page.getByText("They do not select a purchasable variant.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".rw-stage canvas")).toHaveCount(0);
});

test("WebGL failure preserves photography, readable content and navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".rw-hero .rw-stage-fallback")).toBeVisible();
  await expect(page.locator("h1")).toBeVisible();
  await page
    .getByRole("link", { name: "Explore our collections ↗", exact: true })
    .click();
  await expect(page.locator("#collections")).toBeInViewport();
});

test("3D ownership survives route changes and context loss", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (let i = 0; i < 2; i++) {
    await expect(page.locator(".rw-hero .rw-stage")).toHaveAttribute(
      "data-rendering",
      "webgl",
      { timeout: 15000 },
    );
    await expect(page.locator(".rw-hero canvas")).toHaveCount(1);
    await page.getByRole("link", { name: /Shopping bag,/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator(".rw-stage canvas")).toHaveCount(0);
    await page.getByRole("link", { name: "RIWAY home" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.locator('.rw-houses a[href="/shop/purtier-placenta"]').click();
  await expect(page).toHaveURL(/\/shop\/purtier-placenta$/);
  await page.locator("[data-unboxing]").scrollIntoViewIfNeeded();
  await expect(page.locator(".rw-stage")).toHaveAttribute(
    "data-rendering",
    "webgl",
    { timeout: 15000 },
  );
  await page.locator(".rw-stage canvas").evaluate((canvas) => {
    (canvas as HTMLCanvasElement)
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext();
  });
  await expect(page.locator(".rw-stage")).toHaveAttribute(
    "data-rendering",
    "fallback",
  );
  await expect(page.locator(".rw-stage-fallback")).toBeVisible();
  await expect(page.locator(".rw-stage canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mobile menu closes, restores focus and survives route changes", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile menu is replaced by desktop navigation.");
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  await menu.click();
  await expect(page.locator("#main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
  for (const [name, url] of [
    ["Our collections", "/shop"],
    ["Our world", "/about"],
    ["Events", "/events"],
  ]) {
    await menu.click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
  }
});
