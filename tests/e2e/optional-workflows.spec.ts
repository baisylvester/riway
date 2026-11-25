import { test, expect, type BrowserContext } from "@playwright/test";
test.skip(
  process.env.RIWAY_DISPOSABLE_BROWSER !== "1",
  "Requires the disposable local database/Auth fixture; never run against hosted identities.",
);
const users = {
  customer: "81000000-0000-4000-8000-000000000001",
  distributor: "81000000-0000-4000-8000-000000000002",
  editor: "81000000-0000-4000-8000-000000000003",
  reviewer: "81000000-0000-4000-8000-000000000004",
};
async function identity(context: BrowserContext, role: keyof typeof users) {
  const user = {
    id: users[role],
    email: `${role}@example.invalid`,
    email_confirmed_at: "2026-11-25T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
  };
  const payload = {
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    aal: ["editor", "reviewer"].includes(role) ? "aal2" : "aal1",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "synthetic-fixture-signature",
  ].join(".");
  const session = {
    access_token: token,
    refresh_token: "synthetic-refresh",
    expires_at: payload.exp,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);
}
test.describe.configure({ mode: "serial" });
test("customer books and cancels; records persist through page reload", async ({
  page,
  context,
}) => {
  await identity(context, "customer");
  await page.goto("/account/consultations?distributor=QAFIXTURE");
  await expect(
    page.getByRole("heading", { name: "Consultations", exact: true }),
  ).toBeVisible();
  await page.getByLabel(/Available time/).selectOption({ index: 1 });
  await page
    .getByLabel(
      "I confirm this time and agree to share my booking with this distributor.",
    )
    .check();
  await page
    .getByRole("button", { name: "Book consultation", exact: true })
    .click();
  await expect(
    page.getByText("Consultation booked. You can review it below."),
  ).toBeVisible();
  await page.reload();
  const booking = page
    .locator("article")
    .filter({ hasText: "Booking reference:" })
    .first();
  await expect(booking).toContainText("booked");
  await booking.getByLabel("Confirm cancellation").check();
  await booking.getByRole("button", { name: "Cancel consultation" }).click();
  await expect(booking).toContainText("cancelled");
  await page.reload();
  await expect(
    page.locator("article").filter({ hasText: "Booking reference:" }).first(),
  ).toContainText("cancelled");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("communication consent saves and personal export stays in the current account", async ({
  page,
  context,
}) => {
  await identity(context, "customer");
  await page.goto("/account/preferences");
  await page.getByLabel(/Email me a reorder reminder/).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Reorder email preference saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Email me a reorder reminder/)).toBeChecked();
  const response = await context.request.get("/api/account/export");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.subjectId).toBe(users.customer);
  expect(JSON.stringify(data)).not.toContain("reviewer@example.invalid");
});
test("assistant hands health questions to support and refuses another account's order", async ({
  page,
  context,
}) => {
  await identity(context, "customer");
  await page.goto("/account/assistant");
  await page
    .getByLabel("Question", { exact: true })
    .fill("Will this cure cancer?");
  await page.getByLabel(/I agree to use the product assistant/).check();
  await page
    .getByRole("button", { name: "Ask about products", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Assistant answer" }),
  ).toContainText("cannot give medical advice");
  await expect(
    page.getByRole("link", { name: "Talk to RIWAY support" }),
  ).toBeVisible();
  const response = await context.request.post("/api/assistant", {
    headers: { origin: "http://127.0.0.1:4174" },
    data: { mode: "order", orderId: "99000000-0000-4000-8000-000000000099" },
  });
  expect(response.status()).toBe(404);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("library editor drafts; another reviewer publishes and withdraws the sharing page", async ({
  page,
  context,
  browser,
}) => {
  await identity(context, "editor");
  await page.goto("/admin/library");
  await page.getByText("Create a campaign asset", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Create draft asset" }) });
  const title = `Synthetic campaign ${test.info().project.name} ${Date.now()}`;
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form.getByLabel("Approved source URL").fill("/design/purtier-7th.png");
  await form.getByRole("button", { name: "Create draft asset" }).click();
  await expect(
    page.getByText(
      "New draft version saved. Another reviewer must approve it before sharing.",
    ),
  ).toBeVisible();
  const reviewerContext = await browser.newContext({
    viewport:
      test.info().project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
  });
  await identity(reviewerContext, "reviewer");
  const reviewer = await reviewerContext.newPage();
  await reviewer.goto("/admin/library");
  const card = reviewer
    .locator("article")
    .filter({
      has: reviewer.getByRole("heading", { name: title, exact: true }),
    });
  await card
    .getByLabel("Approval / withdrawal reference")
    .fill("SYNTHETIC-REVIEW");
  await card.getByLabel(/I reviewed this exact version/).check();
  await card.getByRole("button", { name: "Record review decision" }).click();
  await expect(
    card.getByText("Version published.", { exact: true }),
  ).toBeVisible();
  await identity(context, "distributor");
  await page.goto("/distributor/library");
  const live = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await live.getByRole("link", { name: "Open sharing page" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const share = page.url();
  await card
    .getByLabel("Approval / withdrawal reference")
    .fill("SYNTHETIC-WITHDRAW");
  await card.getByLabel(/I reviewed this exact version/).check();
  await card.getByLabel("Withdraw currently shared version").check();
  await card.getByRole("button", { name: "Record review decision" }).click();
  await expect(
    card.getByText("Asset withdrawn from the library and sharing page."),
  ).toBeVisible();
  const result = await context.request.get(share);
  const withdrawn = await result.text();
  expect([200, 404]).toContain(result.status());
  expect(withdrawn).toContain("This page could not be found.");
  expect(withdrawn).not.toContain(title);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A different path awaits.",
      exact: true,
    }),
  ).toBeVisible();
  await reviewerContext.close();
});
