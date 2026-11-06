import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4173";
const checks = [];
async function check(name, path, options, status) {
  const response = await fetch(base + path, { redirect: "manual", ...options });
  assert.equal(response.status, status, name);
  checks.push({ name, status: response.status });
  return response;
}
await check("health", "/api/health", {}, 200);
await check("saved bag requires authentication", "/api/cart", {}, 401);
await check("order export requires staff MFA", "/api/admin/export", {}, 403);
await check(
  "media upload requires staff MFA",
  "/api/admin/media",
  { method: "POST", headers: { origin: base } },
  403,
);
await check(
  "forged market origin",
  "/api/market",
  {
    method: "POST",
    headers: {
      origin: "https://untrusted.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ market: "SG" }),
  },
  403,
);
await check(
  "invalid market",
  "/api/market",
  {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ market: "US" }),
  },
  400,
);
const market = await check(
  "valid market cookie",
  "/api/market",
  {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ market: "SG" }),
  },
  200,
);
assert.match(market.headers.get("set-cookie"), /riway-market=SG/);
await check(
  "payment webhook disabled",
  "/api/webhooks/payments",
  { method: "POST" },
  503,
);
await check(
  "malformed checkout",
  "/api/checkout",
  {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{}",
  },
  400,
);
await check("private account redirect", "/account", {}, 307);
await check("private staff redirect", "/admin", {}, 307);
await check("tenant portal requires authentication", "/operations", {}, 307);
const login = await check(
  "login form is safe before JavaScript loads",
  "/auth/login",
  {},
  200,
);
const loginHtml = await login.text();
assert.match(loginHtml, /<form[^>]*method="post"/);
assert.match(loginHtml, /<button[^>]*disabled=""[^>]*>Loading sign-in/);
const loginPassword = loginHtml.match(/<input[^>]*name="password"[^>]*>/)?.[0];
assert.ok(loginPassword);
assert.doesNotMatch(loginPassword, /minlength|maxlength/);
const confirmation = await check(
  "expired confirmation link feedback",
  "/auth/login?error=confirmation",
  {},
  200,
);
assert.match(
  await confirmation.text(),
  /confirmation or password-reset link could not be verified/,
);
await check(
  "unconfigured Clerk webhook",
  "/api/webhooks/clerk",
  { method: "POST" },
  503,
);
await check(
  "notification worker is disabled",
  "/api/internal/notifications",
  { method: "POST" },
  503,
);
await check(
  "referral origin protection",
  "/api/referral",
  {
    method: "POST",
    headers: {
      origin: "https://untrusted.example",
      "content-type": "application/json",
    },
    body: '{"code":"TEST"}',
  },
  403,
);
await check(
  "bag writes reject a missing origin",
  "/api/cart",
  { method: "PUT", body: "[]" },
  403,
);
await check(
  "signed-out bag writes require authentication",
  "/api/cart",
  {
    method: "PUT",
    headers: { origin: base, "content-type": "application/json" },
    body: "[]",
  },
  401,
);
await check(
  "cross-site bag writes are rejected even with a matching origin",
  "/api/cart",
  {
    method: "PUT",
    headers: { origin: base, "sec-fetch-site": "cross-site" },
    body: "[]",
  },
  403,
);
await check(
  "signed-out referral writes require authentication",
  "/api/referral",
  {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: '{"code":"AUDIT-NOT-FOUND"}',
  },
  401,
);
await check(
  "checkout rejects a missing origin",
  "/api/checkout",
  { method: "POST", body: "{}" },
  403,
);
await check(
  "checkout rejects malformed JSON",
  "/api/checkout",
  {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: "{",
  },
  400,
);
const validCheckout = {
  market: "PH",
  items: [{ productId: "90000000-0000-4000-8000-000000000001", quantity: 1 }],
  address: {
    full_name: "HTTP audit fixture",
    phone: "0000000000",
    line1: "Temporary audit address",
    city: "Manila",
    postal_code: "1000",
    country: "PH",
  },
  terms: true,
  idempotencyKey: "90000000-0000-4000-8000-000000000002",
};
const checkoutOptions = (data) => ({
  method: "POST",
  headers: { origin: base, "content-type": "application/json" },
  body: JSON.stringify(data),
});
await check(
  "valid signed-out checkout still requires authentication",
  "/api/checkout",
  checkoutOptions(validCheckout),
  401,
);
await check(
  "checkout rejects a different delivery market",
  "/api/checkout",
  checkoutOptions({
    ...validCheckout,
    address: { ...validCheckout.address, country: "SG" },
  }),
  400,
);
await check(
  "checkout rejects zero quantity",
  "/api/checkout",
  checkoutOptions({
    ...validCheckout,
    items: [{ ...validCheckout.items[0], quantity: 0 }],
  }),
  400,
);
await check(
  "checkout rejects missing terms acceptance",
  "/api/checkout",
  checkoutOptions({ ...validCheckout, terms: false }),
  400,
);
await check(
  "health endpoint rejects unsupported writes",
  "/api/health",
  { method: "POST" },
  405,
);
await check(
  "saved bag rejects unsupported methods",
  "/api/cart",
  { method: "POST" },
  405,
);
const invalidCallback = await check(
  "invalid auth callback stays on the RIWAY origin",
  "/auth/callback?next=https%3A%2F%2Funtrusted.example",
  {},
  307,
);
assert.equal(
  new URL(invalidCallback.headers.get("location"), base).origin,
  new URL(base).origin,
);
assert.match(
  invalidCallback.headers.get("location"),
  /auth\/login\?error=confirmation/,
);
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
