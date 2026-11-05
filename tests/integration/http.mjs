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
console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
