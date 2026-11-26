import { expect, test } from "@playwright/test";

const consoleUrl = "http://127.0.0.1:4682/fixture/manual";

test("manual sandbox supports real referral, sandbox settlement and staff isolation", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.RIWAY_MANUAL_SANDBOX !== "1" ||
      testInfo.project.name !== "chromium",
    "Requires one fresh manual sandbox with disposable identities.",
  );
  const forged = await request.post(consoleUrl, {
    headers: { Origin: "https://example.invalid" },
    form: { action: "sign-in:reviewer" },
    maxRedirects: 0,
  });
  expect(forged.status()).toBe(403);

  await page.goto(consoleUrl);
  await page.getByRole("button", { name: "First-time buyer" }).click();
  await expect(
    page.getByText("Your verified referring distributor has been linked."),
  ).toBeVisible();

  await page.goto(consoleUrl);
  await page.getByLabel("Fulfilment").selectOption("collection");
  await page.getByLabel("Accept synthetic Terms of Sale").check();
  await page.getByLabel("Accept synthetic membership").check();
  await page.getByRole("button", { name: "Create pending order" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("Created pending order");
  const orderId = (await status.innerText()).match(
    /order ([a-f0-9-]{36})/,
  )?.[1];
  expect(orderId).toBeTruthy();

  for (const result of ["paid", "duplicate"]) {
    await page.locator('select[name="order"]').selectOption(orderId!);
    await page.getByRole("button", { name: "Simulate payment" }).click();
    await expect(status).toHaveText(
      `Simulated payment outcome for ${orderId}: ${result}.`,
    );
  }

  await page.getByRole("link", { name: "Membership", exact: true }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: orderId! })
      .getByText("Awaiting RIWAY confirmation"),
  ).toBeVisible();
  await page.goto(`/account/orders/${orderId}`);
  await expect(
    page.getByText(/Synthetic Manila collection centre/).first(),
  ).toBeVisible();

  await page.goto(consoleUrl);
  await page
    .getByRole("button", { name: "PH reviewer without MFA", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your identity." }),
  ).toBeVisible();
  await page.goto(consoleUrl);
  await page
    .getByRole("button", { name: "PH reviewer with MFA", exact: true })
    .click();
  await page.goto("/admin/compensation");
  const hold = page.getByRole("row").filter({
    hasText: orderId!.slice(0, 8).toUpperCase(),
  });
  await expect(hold).toContainText("Membership requires RIWAY confirmation");
});

test("guest checkout verifies a code from the local inbox", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    process.env.RIWAY_MANUAL_SANDBOX !== "1" ||
      testInfo.project.name !== "chromium",
    "Requires one fresh manual sandbox with disposable identities.",
  );
  await page.goto("/checkout");
  const request = page.locator("form").filter({
    has: page.getByRole("button", { name: "Send secure sign-in link" }),
  });
  await request.getByLabel("Email address").fill("guest@example.invalid");
  await request.getByRole("checkbox").check();
  await request
    .getByRole("button", { name: "Send secure sign-in link" })
    .click();
  await expect(
    page.getByText(/Check your email for a secure sign-in/),
  ).toBeVisible();

  const inbox = await context.newPage();
  await inbox.goto(consoleUrl);
  const code = (await inbox.locator("#guest-code").innerText()).match(
    /\d{6}/,
  )?.[0];
  expect(code).toBeTruthy();
  await inbox.close();

  await page.getByText("Enter an emailed code instead").click();
  const field = page.getByLabel("Email code");
  const verify = page.getByRole("button", {
    name: "Verify and continue checkout",
  });
  await field.fill(code === "000000" ? "111111" : "000000");
  await verify.click();
  await expect(page.getByText(/This code could not be verified/)).toBeVisible();
  await field.fill(code!);
  await verify.click();
  await expect(
    page.getByRole("heading", { name: "Continue as a guest" }),
  ).toHaveCount(0);
  await page.goto("/account");
  await expect(
    page
      .getByText("guest@example.invalid", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("a customer receives one queued reminder and settles a due replenishment order", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.RIWAY_MANUAL_SANDBOX !== "1" ||
      testInfo.project.name !== "chromium",
    "Requires one fresh manual sandbox with disposable identities.",
  );
  await page.goto(consoleUrl);
  await page
    .getByRole("button", { name: "PH reviewer with MFA", exact: true })
    .click();
  // The Next router can keep a hidden copy of the previous route mounted.
  const main = page.locator("#main").filter({ visible: true });
  await page.goto("/admin/replenishment");
  await main
    .getByText("Approve a product schedule", { exact: true })
    .filter({ visible: true })
    .click();
  const approval = main
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Approve schedule terms" }),
      visible: true,
    });
  await approval
    .getByLabel("Approved product")
    .selectOption({ label: "Synthetic qualifying goods" });
  await approval.getByLabel("Interval in days").fill("30");
  await approval.getByLabel("Terms version").fill("SYNTHETIC-RENEWAL-1");
  await approval
    .getByLabel("Approved schedule terms")
    .fill("Synthetic schedule terms for this disposable browser test.");
  await approval.getByLabel("Approval reference").fill("SYNTHETIC-RENEWAL");
  await approval
    .getByRole("checkbox", { name: /I verified RIWAY approval/ })
    .check();
  await approval
    .getByRole("button", { name: "Approve schedule terms" })
    .click();
  await expect(
    main.getByRole("heading", { name: "Synthetic qualifying goods" }),
  ).toBeVisible();
  await page.goto("/admin/distributors");
  const product = main.getByRole("row").filter({
    has: page.getByRole("cell", {
      name: "Synthetic qualifying goods",
      exact: true,
    }),
  });
  await product.getByLabel("Reminder lead days").fill("0");
  await product
    .getByLabel("Timing approval reference")
    .fill("SYNTHETIC-RENEWAL-TIMING");
  await product
    .getByRole("button", { name: "Approve reminder timing" })
    .click();
  await expect(
    product.getByText("Reminder timing saved.", { exact: true }),
  ).toBeVisible();

  await page.goto(consoleUrl);
  await page.getByRole("button", { name: "Existing customer" }).click();
  await page.goto("/account/preferences");
  await main
    .getByLabel(/Email me a reorder reminder/)
    .filter({ visible: true })
    .check();
  await main.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByText("Reorder email preference saved.").filter({ visible: true }),
  ).toBeVisible();
  await page.goto(consoleUrl);
  await page.locator('select[name="product"]').selectOption("standard");
  await page.getByLabel("Accept synthetic Terms of Sale").check();
  await page.getByRole("button", { name: "Create pending order" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("Created pending order");
  const original = (await status.innerText()).match(
    /order ([a-f0-9-]{36})/,
  )?.[1];
  expect(original).toBeTruthy();
  await page.locator('select[name="order"]').selectOption(original!);
  await page.getByRole("button", { name: "Simulate payment" }).click();
  await expect(status).toContainText(": paid.");

  await page.goto(`/account/orders/${original}`);
  await main
    .getByRole("link", { name: "Start a replenishment schedule" })
    .click();
  await main
    .getByRole("checkbox", { name: "I accept these schedule terms." })
    .check();
  await main.getByRole("button", { name: "Start schedule" }).click();
  await expect(
    page.getByText(/Next renewal/).filter({ visible: true }),
  ).toBeVisible();
  await page.goto(consoleUrl);
  await page.getByRole("button", { name: "Make next renewal due" }).click();
  await expect(status).toContainText("The sandbox renewal is due");
  const queue = page.getByRole("button", {
    name: "Check for due renewal reminders",
  });
  await queue.click();
  await expect(status).toContainText("1 renewal reminder queued");
  await queue.click();
  await expect(status).toContainText("0 renewal reminders queued");
  await page.getByRole("link", { name: "Your schedules" }).click();
  const review = await main
    .getByRole("link", { name: "Review renewal", exact: true })
    .getAttribute("href");
  expect(review).toMatch(/^\/account\/replenishment\?review=[a-f0-9-]{36}$/);
  const signedOut = await request.get(review!, { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  const login = new URL(signedOut.headers().location, signedOut.url());
  expect(login.pathname).toBe("/auth/login");
  expect(login.searchParams.get("next")).toBe(review);
  await page.goto(`/auth/login?next=${encodeURIComponent(review!)}`);
  await expect(
    main.getByLabel("Current order total").filter({ visible: true }),
  ).toBeVisible();
  await main.getByRole("checkbox", { name: /I confirm this address/ }).check();
  await main.getByRole("button", { name: "Create order for payment" }).click();
  await expect(page).toHaveURL(/\/account\/orders\/[a-f0-9-]{36}$/);
  const renewal = new URL(page.url()).pathname.split("/").at(-1);
  expect(renewal).not.toBe(original);
  await page.goto(consoleUrl);
  await page.locator('select[name="order"]').selectOption(renewal!);
  await page.getByRole("button", { name: "Simulate payment" }).click();
  await expect(status).toContainText(": paid.");
  await page.getByRole("link", { name: "Your schedules" }).click();
  await expect(
    page.getByText(/Next renewal/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Review renewal", exact: true }),
  ).toHaveCount(0);
});
