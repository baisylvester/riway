import { test, expect, type BrowserContext } from "@playwright/test";
test.skip(
  process.env.RIWAY_DISPOSABLE_BROWSER !== "1",
  "Disposable local database/Auth fixture only.",
);
test.describe.configure({ mode: "serial" });
async function identity(context: BrowserContext, reviewer = false) {
  const user = {
    id: reviewer
      ? "81000000-0000-4000-8000-000000000004"
      : "81000000-0000-4000-8000-000000000001",
    email: reviewer ? "reviewer@example.invalid" : "customer@example.invalid",
    email_confirmed_at: "2026-11-25T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const payload = {
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    aal: reviewer ? "aal2" : "aal1",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const access_token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "synthetic-fixture-signature",
  ].join(".");
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            access_token,
            refresh_token: "synthetic-refresh",
            expires_at: payload.exp,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        ).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
      sameSite: "Lax",
    },
  ]);
}
test("language URLs render translated navigation, preserve search and use canonical filter values", async ({
  page,
}) => {
  await page.goto("/fil/shop?q=Synthetic&category=Nutrition#results");
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  await expect(
    page.getByRole("heading", {
      name: "Tuklasin ang pambihira sa araw-araw.",
      exact: true,
    }),
  ).toBeVisible();
  const filter = page.locator("form.filter-bar");
  await filter.getByRole("combobox").selectOption("Skincare");
  await filter.getByRole("button", { name: "Maghanap", exact: true }).click();
  await expect(page).toHaveURL(
    /\/fil\/shop\?q=Synthetic&category=Skincare#results$/,
  );
  await expect(filter.getByRole("combobox")).toHaveValue("Skincare");
  await page
    .getByRole("combobox", { name: "Wika", exact: true })
    .selectOption("zh-CN");
  await expect(page).toHaveURL(
    /\/zh-CN\/shop\?q=Synthetic&category=Skincare#results$/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("button", { name: "搜索", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.cache/localization-${test.info().project.name}.png`,
    fullPage: false,
  });
});
test("language switching preserves the bag and country changes fall back to an available language", async ({
  page,
}) => {
  await page.goto("/fil/shop/synthetic-qualifier-desktop");
  await page
    .getByRole("button", { name: "Idagdag sa bag para suriin", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Tingnan ang bag →", exact: true })
    .click();
  await expect(page).toHaveURL(/\/fil\/cart$/);
  await expect(
    page.getByRole("heading", { name: "Iyong bag.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Wika", exact: true })
    .selectOption("ms");
  await expect(
    page.getByRole("heading", { name: "Beg anda.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Pilih negara", exact: true })
    .selectOption("SG");
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Your bag.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(1);
});
test("CMS selects published translations and marks English fallback while hiding translated drafts", async ({
  page,
}) => {
  await page.goto("/fil/support");
  const translated = page.locator('[data-cms-section="support-contacts"]');
  await expect(translated).toHaveAttribute("lang", "fil");
  await expect(
    translated.getByRole("heading", {
      name: "Mga synthetic contact",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/ms/support");
  const fallback = page.locator('[data-cms-section="support-contacts"]');
  await expect(fallback).toHaveAttribute("lang", "en");
  await expect(
    fallback.getByRole("heading", {
      name: "Synthetic English contacts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("This unpublished Malay draft must not be visible.", {
      exact: true,
    }),
  ).toHaveCount(0);
});
test("staff publish an independent product translation without changing its English version", async ({
  page,
  context,
}) => {
  const mobile = test.info().project.name === "mobile",
    slug = mobile
      ? "synthetic-qualifier-mobile"
      : "synthetic-qualifier-desktop",
    name = mobile
      ? "Synthetic mobile qualifying goods"
      : "Synthetic qualifying goods";
  await page.goto(`/fil/shop/${slug}`);
  const panel = page.locator('[data-product-content="PH"]:visible');
  await expect(panel).toHaveAttribute("lang", "en");
  await expect(panel).toContainText("Synthetic approved English ingredients");
  await identity(context, true);
  await page.goto("/admin/product-content?market=PH&locale=fil");
  const card = page.locator("section.panel").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`^${name} · PH · Filipino`),
    }),
  });
  await card
    .getByLabel("Ingredients", { exact: true })
    .filter({ visible: true })
    .fill(
      "Synthetic Filipino ingredients published in a disposable browser test.",
    );
  await card
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("published");
  await card
    .getByLabel("Approval reference", { exact: true })
    .filter({ visible: true })
    .fill("SYNTHETIC-TRANSLATION");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("status")).toHaveText("Published.");
  await context.clearCookies();
  await page.goto(`/fil/shop/${slug}`);
  await expect(
    page.locator('[data-product-content="PH"]:visible'),
  ).toHaveAttribute("lang", "fil");
  await expect(
    page.locator('[data-product-content="PH"]:visible'),
  ).toContainText("Synthetic Filipino ingredients");
  await page.goto(`/shop/${slug}`);
  await expect(
    page.locator('[data-product-content="PH"]:visible'),
  ).toContainText("Synthetic approved English ingredients");
});
test("localized private URLs keep authentication and reject API/staff aliases and header spoofing", async ({
  page,
}) => {
  await page.goto("/fil/account/orders");
  await expect(page).toHaveURL(/\/fil\/auth\/login$/);
  for (const path of [
    "/fil/api/account/export",
    "/fil/admin/returns",
    "/fil/auth/callback",
  ])
    expect((await page.request.get(path)).status()).toBe(404);
  const plain = await page.request.get("/shop", {
    headers: { "x-riway-locale": "fil", "x-riway-path": "/admin" },
  });
  expect(await plain.text()).toContain('<html lang="en"');
});
test("only reviewed complete translations enter sitemap and hreflang", async ({
  page,
}) => {
  await page.goto("/fil/shop");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/fil\/shop$/,
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="fil"]'),
  ).toHaveAttribute("href", /\/fil\/shop$/);
  await page.goto("/ms/shop");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/shop$/,
  );
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/fil/shop");
  expect(sitemap).not.toContain("/ms/shop");
  expect(sitemap).not.toContain("/fil/account");
});
test("authenticated account actions and navigation work on localized URLs", async ({
  page,
  context,
}) => {
  await identity(context);
  await page.goto("/fil/account/preferences");
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
  const consent = page
    .getByLabel(/Email me a reorder reminder/)
    .filter({ visible: true });
  const original = await consent.isChecked();
  await consent.setChecked(!original);
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Reorder email preference saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(consent).toBeChecked({ checked: !original });
  await consent.setChecked(original);
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Reorder email preference saved.", { exact: true }),
  ).toBeVisible();
  const orders = page.getByRole("link", { name: "Orders", exact: true });
  await expect(orders).toHaveAttribute("href", "/fil/account/orders");
  await orders.click();
  await expect(page).toHaveURL(/\/fil\/account\/orders$/);
  await expect(
    page.getByRole("heading", { name: "Your orders", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fil");
});
