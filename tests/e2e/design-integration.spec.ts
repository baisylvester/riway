import { test, expect } from "@playwright/test";

test("goals support keyboard selection and semantic expansion", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  const wheel = page.locator("#hero .wheel .item");
  await expect(wheel).toHaveCount(6);
  await expect(wheel.first()).toHaveAttribute("aria-pressed", "true");
  if (isMobile) {
    // The source replaces the desktop ring with ordinary keyboard buttons.
    const health = page.locator("#hero .strip button").nth(1);
    await health.focus();
    await page.keyboard.press("Enter");
    await expect(health).toHaveAttribute("aria-pressed", "true");
  } else {
    await wheel.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(wheel.nth(1)).toBeFocused();
  }
  await expect(wheel.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('#hero .wheel .item[aria-pressed="true"]'),
  ).toHaveCount(1);
  await expect(wheel.first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#capH")).toHaveText(
    "A body that carries the dream.",
  );
  await expect(page.locator("#capP")).toHaveText(
    "A healthy body, for a better quality of life and the ability to realise our dream.",
  );
  const goal = page.locator("#goals .goal").first();
  const description = goal.locator("p");
  await expect(goal).toHaveAttribute("role", "button");
  await expect(goal).toHaveAttribute("tabindex", "0");
  await expect(description).toHaveCSS("max-height", "0px");
  await goal.focus();
  await page.keyboard.press("Enter");
  await expect(goal).toHaveAttribute("aria-expanded", "true");
  await expect(goal).toHaveClass(/\bis-open\b/);
  await expect(description).toBeVisible();
  await expect(description).toHaveCSS("opacity", "1");
  await expect(description).toContainText("achieve financial freedom");
  await page.keyboard.press("Space");
  await expect(goal).toHaveAttribute("aria-expanded", "false");
  await expect(goal).not.toHaveClass(/\bis-open\b/);
  await expect(description).toHaveCSS("max-height", "0px");
  await expect(description).toHaveCSS("opacity", "0");
});

test("market changes refresh product context and failures are announced", async ({
  page,
}) => {
  await page.goto("/shop/purtier-placenta");
  await page.waitForLoadState("networkidle");
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
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".result-count")).toHaveText("1 collection");
  await expect(
    page.getByRole("heading", { name: "CONSCIENTIOUS", exact: true }),
  ).toBeVisible();
  await page.goto("/shop?q=no-such-collection");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "No matching collections" }),
  ).toBeVisible();
  await page.goto("/shop/conscientious");
  await page.waitForLoadState("networkidle");
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
  await page.waitForLoadState("networkidle");
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
  await page.waitForLoadState("networkidle");
  const hero = page.locator("#hero .reference-stage");
  await expect(hero).toHaveAttribute("data-rendering", "static");
  await expect(hero.locator(".reference-stage-fallback")).toBeVisible();
  await expect(hero.locator(".reference-stage-fallback")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect
    .poll(() =>
      hero
        .locator(".reference-stage-fallback")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(hero.locator("canvas")).toHaveCSS("opacity", "0");

  await page.goto("/conscientious");
  await page.waitForLoadState("networkidle");
  const presentation = page.locator(
    '.reference-design[data-brand="CONSCIENTIOUS"]',
  );
  await expect(page.locator(".reference-design .loader")).toHaveCount(0);
  await expect(page.locator("#hero .reference-stage-fallback")).toBeVisible();
  await expect(page.locator("#hero .u3")).toBeVisible();
  await expect(
    page.locator('.reference-stage[data-rendering="webgl"]'),
  ).toHaveCount(0);
  for (const canvas of await page.locator(".reference-stage canvas").all()) {
    await expect(canvas).toHaveCSS("opacity", "0");
  }

  await page
    .getByRole("button", { name: "Explore CONSCIENTIOUS for her", exact: true })
    .click();
  await expect(presentation).toHaveClass(/\btheme-her\b/);
  await expect(presentation).not.toHaveClass(/\btheme-him\b/);
  const toggle = page.locator(".toggle");
  await expect(toggle).toHaveClass(/\bis-on\b/);
  await expect(
    toggle.getByRole("button", { name: "For her", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#her")).toBeInViewport();

  await toggle.getByRole("button", { name: "For him", exact: true }).click();
  await expect(presentation).toHaveClass(/\btheme-him\b/);
  await expect(presentation).not.toHaveClass(/\btheme-her\b/);
  await expect(
    toggle.getByRole("button", { name: "For him", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    toggle.getByRole("button", { name: "For her", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#him")).toBeInViewport();

  await page.goto("/shop/conscientious");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "Add to bag for review" }),
  ).toBeVisible();
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
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator("#hero .reference-stage")).toHaveAttribute(
    "data-rendering",
    "fallback",
  );
  await expect(page.locator("#hero .reference-stage-fallback")).toBeVisible();
  await expect(page.locator("#hero h1")).toBeVisible();
  await page.locator('.houses a.house[href="/purtier"]').click();
  await expect(page).toHaveURL(/\/purtier$/);
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator("#hero .reference-stage")).toHaveAttribute(
    "data-rendering",
    "fallback",
  );
  await expect(page.locator("#hero .reference-stage-fallback")).toBeVisible();
  await expect(page.locator("#hero h1")).toHaveText("The luxury of health.");
  await expect(page.locator("#hero h1")).toBeVisible();
});

test("3D ownership survives route changes and context loss", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 2; i++) {
    await expect(page.locator("#hero .reference-stage")).toHaveAttribute(
      "data-rendering",
      "webgl",
      { timeout: 15000 },
    );
    await expect(page.locator("#hero .reference-stage canvas")).toHaveCount(1);
    await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
      timeout: 15000,
    });
    // Leave through a real source menu link, then return via commerce chrome.
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page
      .getByRole("dialog", { name: "RIWAY menu", exact: true })
      .locator('a[href="/about"]')
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator(".reference-stage canvas")).toHaveCount(0);
    await page.getByRole("link", { name: /Shopping bag,/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator(".reference-stage canvas")).toHaveCount(0);
    await page.getByRole("link", { name: "RIWAY home" }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  await page.locator('.houses a.house[href="/purtier"]').click();
  await expect(page).toHaveURL(/\/purtier$/);
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  const stage = page.locator('#hero .reference-stage[data-kind="purtier"]');
  await expect(stage).toHaveAttribute("data-rendering", "webgl", {
    timeout: 15000,
  });
  const lost = await stage.locator("canvas").evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lost, "The test must actually lose the live WebGL context").toBe(true);
  await expect(stage).toHaveAttribute("data-rendering", "fallback");
  await expect(stage.locator(".reference-stage-fallback")).toBeVisible();
  await expect(stage.locator("canvas")).toHaveCount(1);
  await expect(stage.locator("canvas")).toHaveCSS("opacity", "0");
  await expect(page.locator("#hero h1")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile menu closes, restores focus and survives route changes", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile menu is replaced by desktop navigation.");
  test.setTimeout(60000);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
    timeout: 15000,
  });
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "RIWAY menu", exact: true });
  await expect(dialog).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await expect(page.locator("#hero")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".reference-design .menu")).toHaveAttribute(
    "inert",
    "",
  );
  await expect(page.locator("#hero")).not.toHaveAttribute("inert", "");
  for (const url of ["/purtier", "/conscientious", "/shop"]) {
    await menu.click();
    await expect(dialog).toBeVisible();
    const link = dialog.locator(`a[href="${url}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(page.locator(".reference-design .loader")).toHaveCount(0, {
      timeout: 15000,
    });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.locator("#main section[inert], #main footer[inert]"),
    ).toHaveCount(0);
    if (url !== "/shop") {
      await expect(page.locator("#hero")).not.toHaveAttribute("inert", "");
      await expect(page.locator(".reference-design .menu")).toHaveAttribute(
        "inert",
        "",
      );
    } else {
      await expect(
        page.getByRole("heading", {
          name: "Discover your everyday extraordinary.",
        }),
      ).toBeVisible();
    }
  }
});
