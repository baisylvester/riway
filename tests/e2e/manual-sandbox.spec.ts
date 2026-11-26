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
  await expect(page.getByText("guest@example.invalid")).toBeVisible();
});
