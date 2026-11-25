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
test("market staff approve and withdraw a bonus campaign; customers cannot access its controls", async ({
  page,
  context,
}) => {
  const mobile = test.info().project.name === "mobile";
  const qualifier = mobile
    ? "84000000-0000-4000-8000-000000000003"
    : "84000000-0000-4000-8000-000000000001";
  const gift = mobile
    ? "84000000-0000-4000-8000-000000000004"
    : "84000000-0000-4000-8000-000000000002";
  await identity(context, "reviewer");
  await page.goto("/admin/bonuses");
  await page.getByText("Approve a campaign", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "Approve bonus campaign",
        exact: true,
      }),
    });
  const name = `Synthetic campaign ${test.info().project.name}`;
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form
    .getByLabel("Qualifying product ID", { exact: true })
    .fill(qualifier);
  await form
    .getByLabel("Minimum qualifying quantity", { exact: true })
    .fill("1");
  await form
    .getByLabel("Bonus physical product ID", { exact: true })
    .fill(gift);
  await form
    .getByLabel("Bonus quantity per qualifying quantity", { exact: true })
    .fill("1");
  await form
    .getByLabel("Maximum bonus units per order", { exact: true })
    .fill("1");
  await form
    .getByLabel("Maximum campaign bonus units", { exact: true })
    .fill("5");
  await form
    .getByLabel("Start timestamp (UTC ISO 8601)", { exact: true })
    .fill(new Date(Date.now() - 3600000).toISOString());
  await form
    .getByLabel("End timestamp (UTC ISO 8601)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString());
  await form
    .getByLabel("Approved return terms", { exact: true })
    .fill("Synthetic return terms for disposable browser acceptance only.");
  await form
    .getByLabel("Approval reference", { exact: true })
    .fill("SYNTHETIC-ONLY");
  await form.getByLabel(/I approve retaining paid campaign/).check();
  await form.getByLabel(/I approve these exact quantities/).check();
  await form
    .getByRole("button", { name: "Approve bonus campaign", exact: true })
    .click();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toContainText("0 / 5 units allocated");
  await card
    .getByLabel("Withdrawal reference", { exact: true })
    .fill("SYNTHETIC-WITHDRAW");
  await card
    .getByLabel("Confirm withdrawal from future quotes.", { exact: true })
    .check();
  await card
    .getByRole("button", { name: "Withdraw bonus campaign", exact: true })
    .click();
  await expect(card).toContainText("Withdrawn");
  await page.reload();
  await expect(card).toContainText("Withdrawn");
  await identity(context, "customer");
  await page.goto("/admin/bonuses");
  await expect(
    page.getByRole("button", { name: "Approve bonus campaign", exact: true }),
  ).toHaveCount(0);
});
test("customer books, reschedules and cancels; records persist through page reload", async ({
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
  const previousTime = await booking.getByRole("status").first().textContent();
  await booking.getByLabel(/New time/).selectOption({ index: 1 });
  await booking
    .getByLabel(
      "I confirm this time and agree to share my booking with this distributor.",
    )
    .check();
  await booking
    .getByRole("button", { name: "Reschedule consultation" })
    .click();
  await expect(booking.getByRole("status").first()).not.toHaveText(
    previousTime!,
  );
  await page.reload();
  await expect(booking.getByRole("status").first()).not.toHaveText(
    previousTime!,
  );
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

test("event capacity, cancellation and staff check-in persist across customer and staff views", async ({
  page,
  context,
}) => {
  const mobile = test.info().project.name === "mobile";
  const eventId = mobile
    ? "83000000-0000-4000-8000-000000000002"
    : "83000000-0000-4000-8000-000000000001";
  const slug = mobile ? "synthetic-event-mobile" : "synthetic-event";
  await identity(context, "reviewer");
  await page.goto(`/admin/events?event=${eventId}`);
  await page.getByLabel("Capacity", { exact: true }).fill("1");
  await page
    .getByLabel("Approval reference", { exact: true })
    .fill("SYNTHETIC-CAPACITY");
  await page.getByRole("button", { name: "Approve capacity" }).click();
  await expect(
    page.getByText("Capacity approved.", { exact: true }),
  ).toBeVisible();
  await identity(context, "customer");
  await page.goto(`/events/${slug}`);
  await page.getByRole("button", { name: "Register for event" }).click();
  await expect(
    page.getByText("Your registration is confirmed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1 registered / 1 places", { exact: true }),
  ).toBeVisible();
  await identity(context, "distributor");
  await page.goto(`/events/${slug}`);
  await page.getByRole("button", { name: "Register for event" }).click();
  await expect(
    page.getByText("Registration is unavailable for this event.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel registration" }),
  ).toHaveCount(0);
  await identity(context, "customer");
  await page.goto(`/events/${slug}`);
  await page.getByLabel("I confirm cancellation.").check();
  await page.getByRole("button", { name: "Cancel registration" }).click();
  await expect(
    page.getByText("Your registration · cancelled", { exact: true }),
  ).toBeVisible();
  await identity(context, "distributor");
  await page.goto(`/events/${slug}`);
  await page.getByRole("button", { name: "Register for event" }).click();
  await expect(
    page.getByText("Your registration is confirmed.", { exact: true }),
  ).toBeVisible();
  await identity(context, "reviewer");
  await page.goto(`/admin/events?event=${eventId}`);
  await page.getByLabel("I verified this attendee’s registration.").check();
  await page.getByRole("button", { name: "Check in attendee" }).click();
  await expect(
    page.getByText("Attendee · registered · Checked in", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Attendee · registered · Checked in", { exact: true }),
  ).toBeVisible();
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
  const card = reviewer.locator("article").filter({
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
  await expect(page).toHaveURL(/\/materials\/[0-9a-f-]+\?market=PH$/);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const share = page.url();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(share);
  await expect(
    publicPage.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await card
    .getByLabel("Approval / withdrawal reference")
    .fill("SYNTHETIC-WITHDRAW");
  await card.getByLabel(/I reviewed this exact version/).check();
  await card.getByLabel("Withdraw currently shared version").check();
  await card.getByRole("button", { name: "Record review decision" }).click();
  await expect(
    card.getByText("Asset withdrawn from the library and sharing page."),
  ).toBeVisible();
  const result = await publicContext.request.get(share);
  const withdrawn = await result.text();
  expect([200, 404]).toContain(result.status());
  expect(withdrawn).toContain("This page could not be found.");
  expect(withdrawn).not.toContain(title);
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", {
      name: "A different path awaits.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await publicContext.close();
  await reviewerContext.close();
});
