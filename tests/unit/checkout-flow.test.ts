// Full checkout flow, server side: the real quote, checkout, resume, webhook
// and reconciliation routes against the real migrations (PGlite), with
// customer calls running as `authenticated` under RLS and a fake Xendit API.
// Nothing leaves the process.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({
  user: null as null | { id: string },
  service: null as unknown,
}));
vi.mock("@/lib/data", () => ({
  session: async () => ({ user: holder.user, client: userClient() }),
}));
vi.mock("@/lib/referral-continuity", () => ({
  completePendingReferral: async () => ({ state: "none", message: "" }),
}));
// Only the external edges are replaced: the service-role Supabase client
// (backed by PGlite) and network fetch (the fake Xendit API). The payment
// service, its configuration and every route run unmodified.
vi.mock("@supabase/supabase-js", async (load) => ({
  ...(await load<typeof import("@supabase/supabase-js")>()),
  createClient: () => holder.service,
}));
import { eligibleChannels } from "../../src/lib/xendit-channels";
import { POST as quoteRoute } from "../../src/app/api/checkout/quote/route";
import { POST as checkoutRoute } from "../../src/app/api/checkout/route";
import { POST as resumeRoute } from "../../src/app/api/payments/resume/route";
import { POST as webhookRoute } from "../../src/app/api/webhooks/xendit/route";
import { POST as workerRoute } from "../../src/app/api/internal/payments/route";

const root = resolve(import.meta.dirname, "../..");
const pg = new PGlite();
const site = "https://riway.example.invalid";
const key = "xnd_development_checkoutflowfixture";
const token = "checkout-flow-callback-token-0123456789";
const workerSecret = "w".repeat(40);
const subAccount = "sub_ph_checkout_01";
const ids = {
  customer: "73000000-0000-4000-8000-000000000001",
  other: "73000000-0000-4000-8000-000000000002",
  sponsor: "73000000-0000-4000-8000-000000000003",
  product: "73000000-0000-4000-8000-000000000004",
  second: "73000000-0000-4000-8000-000000000005",
};
const address = {
  full_name: "Checkout QA",
  phone: "0000000000",
  line1: "Synthetic address 1",
  city: "Manila",
  postal_code: "1000",
  country: "PH",
};

// ---------- database clients ----------
async function as<T>(
  role: "authenticated" | "service_role",
  sub: string | null,
  fn: () => Promise<T>,
) {
  await pg.exec(
    `select set_config('request.jwt.claims','${JSON.stringify(sub ? { sub, role, aal: "aal1" } : { role })}',false)`,
  );
  await pg.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await pg.exec("reset role");
  }
}
const setReturning = new Set([
  "pending_xendit_payments",
  "pending_stripe_checkouts",
]);
function rpcClient(
  role: "authenticated" | "service_role",
  sub: () => string | null,
) {
  return {
    async rpc(name: string, args: Record<string, unknown> = {}) {
      const keys = Object.keys(args);
      const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")})`;
      try {
        const r = await as(role, sub(), () =>
          pg.query<Record<string, unknown>>(
            setReturning.has(name)
              ? `select * from ${call}`
              : `select ${call} as r`,
            keys.map((k) => {
              const v = args[k];
              return v !== null && typeof v === "object" && !Array.isArray(v)
                ? JSON.stringify(v)
                : Array.isArray(v) && typeof v[0] === "object"
                  ? JSON.stringify(v)
                  : v;
            }),
          ),
        );
        return {
          data: setReturning.has(name) ? r.rows : r.rows[0].r,
          error: null,
        };
      } catch (e) {
        const err = e as { message: string; code?: string };
        return {
          data: null,
          error: { message: err.message, code: err.code ?? "P0001" },
        };
      }
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let columns = "*";
      const b = {
        select(c: string) {
          columns = c;
          return b;
        },
        eq(c: string, v: unknown) {
          filters.push([c, v]);
          return b;
        },
        async maybeSingle() {
          try {
            const r = await as(role, sub(), () =>
              pg.query(
                `select ${columns} from public.${table} where ${filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ")}`,
                filters.map(([, v]) => v),
              ),
            );
            return { data: r.rows[0] ?? null, error: null };
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        },
      };
      return b;
    },
  };
}
const userClient = () =>
  rpcClient("authenticated", () => holder.user?.id ?? null);
const service = rpcClient("service_role", () => null);
holder.service = service;

// ---------- fake Xendit ----------
let sessionCounter = 0;
type FakeSession = {
  id: string;
  account: string;
  body: Record<string, unknown>;
  status: string;
  paymentId: string | null;
};
const fake = {
  sessions: new Map<string, FakeSession>(),
  creates: 0,
  reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  },
  view(s: FakeSession) {
    return {
      payment_session_id: s.id,
      reference_id: s.body.reference_id,
      status: s.status,
      session_type: s.body.session_type,
      currency: s.body.currency,
      amount: s.body.amount,
      country: s.body.country,
      payment_link_url: `https://checkout-staging.xendit.co/sessions/${s.id}`,
      payment_id: s.paymentId,
    };
  },
  async fetch(url: string | URL | Request, init: RequestInit = {}) {
    const u = new URL(String(url));
    const h = init.headers as Record<string, string>;
    if (h.Authorization !== `Basic ${btoa(`${key}:`)}`)
      return fake.reply({ error_code: "INVALID_API_KEY" }, 401);
    const account = h["for-user-id"] ?? "master";
    if (init.method === "POST" && u.pathname === "/sessions") {
      fake.creates++;
      const body = JSON.parse(String(init.body));
      const s = {
        id: `ps-flow${String(++sessionCounter).padStart(6, "0")}`,
        account,
        body,
        status: "ACTIVE",
        paymentId: null,
      };
      fake.sessions.set(s.id, s);
      return fake.reply(fake.view(s), 201);
    }
    const m = u.pathname.match(/^\/sessions\/(ps-[A-Za-z0-9]+)(\/cancel)?$/);
    const s = m ? fake.sessions.get(m[1]) : undefined;
    if (!s || s.account !== account)
      return fake.reply({ error_code: "NOT_FOUND" }, 404);
    if (m?.[2]) {
      if (s.status !== "ACTIVE")
        return fake.reply({ error_code: "INVALID_SESSION_STATUS" }, 422);
      s.status = "CANCELED";
    }
    return fake.reply(fake.view(s));
  },
  pay(id: string) {
    const s = fake.sessions.get(id)!;
    s.status = "COMPLETED";
    s.paymentId = `py-${id}`;
  },
};

// ---------- helpers ----------
const json = (body: unknown, origin = site) =>
  new Request(`${site}/api`, {
    method: "POST",
    headers: {
      Origin: origin,
      Host: "riway.example.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const items = (quantity = 1) => [{ productId: ids.product, quantity }];
async function quote(sel = items()) {
  const r = await quoteRoute(json({ market: "PH", items: sel }));
  return { status: r.status, body: await r.json() };
}
async function checkout(extra: Record<string, unknown> = {}, sel = items()) {
  const q = await quote(sel);
  const r = await checkoutRoute(
    json({
      market: "PH",
      items: sel,
      address,
      terms: true,
      termsVersion: "2026-11-draft",
      idempotencyKey: crypto.randomUUID(),
      quoteHash: q.body.quoteHash,
      payment: { gateway: "xendit", channel: "BPI_ONLINE_BANKING" },
      ...extra,
    }),
  );
  return { status: r.status, body: await r.json(), quote: q.body };
}
const sessionId = (url: string) => url.split("/").pop()!;
const hook = (event: string, s: FakeSession, tok = token) =>
  webhookRoute(
    new Request(`${site}/api/webhooks/xendit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-callback-token": tok },
      body: JSON.stringify({
        event,
        data: { payment_session_id: s.id, reference_id: s.body.reference_id },
      }),
    }),
  );
const row = async (sql: string, p: unknown[] = []) =>
  (await pg.query<Record<string, unknown>>(sql, p)).rows[0];
const order = (id: string) =>
  row(
    `select o.status,o.payment_status,o.total_minor::int as total,(select count(*)::int from public.inventory_reservations r where r.order_id=o.id) as holds from public.orders o where o.id=$1`,
    [id],
  );
const stock = async () =>
  row(
    `select on_hand::int,reserved::int from public.inventory where product_id=$1 and market='PH'`,
    [ids.product],
  );
const status = async (orderId: string) =>
  (await userClient().rpc("xendit_payment_status", { p_order: orderId }))
    .data as Record<string, unknown> | null;

beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  for (const n of readdirSync(resolve(root, "supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", n), "utf8"),
    );
  await pg.exec(`
    insert into auth.users(id,email) values('${ids.customer}','checkout-qa@example.invalid'),('${ids.other}','checkout-qa-2@example.invalid'),('${ids.sponsor}','checkout-sponsor@example.invalid');
    insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
      values('${ids.sponsor}','${ids.sponsor}','QA-CHECKOUT','Checkout QA sponsor',true,now(),'PH');
    insert into public.sponsor_attributions(user_id,distributor_id) values('${ids.customer}','${ids.sponsor}'),('${ids.other}','${ids.sponsor}');
    insert into public.products(id,slug,name,category,status) values
      ('${ids.product}','checkout-qa','Checkout QA product','Nutrition','published'),
      ('${ids.second}','checkout-qa-2','Checkout QA second','Skincare','published');
    insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
      values('${ids.product}','PH','PHP',123450,true,'CHECKOUT-QA',24),('${ids.second}','PH','PHP',5000,true,'CHECKOUT-QA',24);
    insert into public.inventory(product_id,market,on_hand) values('${ids.product}','PH',10),('${ids.second}','PH',10);
    update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='CHECKOUT-QA-ONLY' where code='PH';
    insert into private.xendit_market_accounts(market,livemode,account_type,sub_account_id,account_status,enabled_channels,payments_enabled)
      values('PH',false,'OWNED','${subAccount}','LIVE','{GCASH,BPI_ONLINE_BANKING,QRPH}',true);
  `);
}, 60000);
afterAll(() => pg.close());
beforeEach(() => {
  holder.user = { id: ids.customer };
  holder.service = service;
  vi.stubGlobal("fetch", fake.fetch);
  vi.stubEnv("PAYMENT_PROVIDERS", "xendit");
  vi.stubEnv("XENDIT_MODE", "test");
  vi.stubEnv("XENDIT_SECRET_KEY", key);
  vi.stubEnv("XENDIT_WEBHOOK_TOKEN", token);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-fixture");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);
  vi.stubEnv("PAYMENT_WORKER_SECRET", workerSecret);
  vi.stubEnv("COMMERCE_TERMS_VERSION", "2026-11-draft");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});

describe("checkout flow (server side, end to end)", { timeout: 30000 }, () => {
  it("1. reviews the total from server prices and offers only methods that fit it", async () => {
    const q = await quote(items(2));
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({
      market: "PH",
      currency: "PHP",
      totalMinor: 246900,
    });
    expect(q.body.quoteHash).toMatch(/^[a-f0-9]{64}$/);
    const enabled = (
      await userClient().rpc("xendit_checkout_channels", {
        p_market: "PH",
        p_live: false,
      })
    ).data as string[];
    // QR Ph is capped at PHP 50,000, so it is hidden for a larger order.
    expect(
      eligibleChannels("PH", enabled, q.body.totalMinor).map((c) => c.code),
    ).toEqual(["GCASH", "QRPH", "BPI_ONLINE_BANKING"]);
    // PHP 150,000 exceeds GCash (PHP 100,000) but not BPI online banking (PHP 250,000).
    expect(
      eligibleChannels("PH", enabled, 15_000_000).map((c) => c.code),
    ).toEqual(["BPI_ONLINE_BANKING"]);
  });

  it("2. places the order, routes payment to the market sub-account and pays once", async () => {
    const before = await stock();
    const r = await checkout({}, items(2));
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(
      /^https:\/\/checkout-staging\.xendit\.co\/sessions\/ps-flow/,
    );
    const s = fake.sessions.get(sessionId(r.body.url))!;
    expect(s.account).toBe(subAccount);
    expect(s.body).toMatchObject({
      amount: 2469,
      currency: "PHP",
      country: "PH",
      allowed_payment_channels: ["BPI_ONLINE_BANKING"],
    });
    expect(await order(r.body.orderId)).toMatchObject({
      status: "awaiting_payment",
      payment_status: "pending",
      total: 246900,
      holds: 1,
    });
    expect(await status(r.body.orderId)).toMatchObject({
      phase: "open",
      channel: "BPI_ONLINE_BANKING",
    });
    // Returning from Xendit confirms nothing; only the verified webhook does.
    fake.pay(s.id);
    expect(await order(r.body.orderId)).toMatchObject({
      payment_status: "pending",
    });
    expect((await hook("payment_session.completed", s)).status).toBe(200);
    expect((await hook("payment_session.completed", s)).status).toBe(200);
    expect(await order(r.body.orderId)).toMatchObject({
      status: "paid",
      payment_status: "paid",
      holds: 0,
    });
    expect(await status(r.body.orderId)).toMatchObject({ phase: "paid" });
    const after = await stock();
    expect(after.on_hand).toBe(Number(before.on_hand) - 2);
    expect(after.reserved).toBe(before.reserved);
    // Resuming a paid order sends the customer to the order page, not to pay again.
    const resumed = await resumeRoute(json({ orderId: r.body.orderId }));
    expect(await resumed.json()).toMatchObject({
      state: "paid",
      url: `${site}/account/orders/${r.body.orderId}`,
    });
  });

  it("3. a repeated submission reuses the same order and payment link", async () => {
    const q = await quote();
    const body = {
      market: "PH",
      items: items(),
      address,
      terms: true,
      termsVersion: "2026-11-draft",
      idempotencyKey: crypto.randomUUID(),
      quoteHash: q.body.quoteHash,
      payment: { gateway: "xendit", channel: "GCASH" },
    };
    const creates = fake.creates;
    const a = await (await checkoutRoute(json(body))).json();
    const b = await (await checkoutRoute(json(body))).json();
    expect(b.orderId).toBe(a.orderId);
    expect(b.url).toBe(a.url);
    expect(fake.creates).toBe(creates + 1);
  });

  it("4. switching method keeps the order, cancels the old link and opens a new one", async () => {
    const r = await checkout({
      payment: { gateway: "xendit", channel: "GCASH" },
    });
    const old = fake.sessions.get(sessionId(r.body.url))!;
    const switched = await (
      await resumeRoute(
        json({ orderId: r.body.orderId, channel: "BPI_ONLINE_BANKING" }),
      )
    ).json();
    expect(old.status).toBe("CANCELED");
    const next = fake.sessions.get(sessionId(switched.url))!;
    expect(next.id).not.toBe(old.id);
    expect(next.body.allowed_payment_channels).toEqual(["BPI_ONLINE_BANKING"]);
    expect(await order(r.body.orderId)).toMatchObject({
      status: "awaiting_payment",
      holds: 1,
    });
    expect(await status(r.body.orderId)).toMatchObject({
      phase: "open",
      channel: "BPI_ONLINE_BANKING",
      attemptNo: 2,
    });
  });

  it("5. an expired payment releases the order and its stock", async () => {
    const before = await stock();
    const r = await checkout();
    expect((await stock()).reserved).toBe(Number(before.reserved) + 1);
    const s = fake.sessions.get(sessionId(r.body.url))!;
    s.status = "EXPIRED";
    expect((await hook("payment_session.expired", s)).status).toBe(200);
    expect(await order(r.body.orderId)).toMatchObject({
      status: "cancelled",
      payment_status: "failed",
      holds: 0,
    });
    expect(await stock()).toEqual(before);
    expect(await status(r.body.orderId)).toMatchObject({ phase: "expired" });
  });

  it("6. a missed webhook is recovered by the minute worker", async () => {
    const r = await checkout();
    fake.pay(sessionId(r.body.url));
    await pg.exec(
      `update private.xendit_payments set next_check_at=case when order_id='${r.body.orderId}' then now()-interval '1 minute' else now()+interval '1 day' end`,
    );
    const w = await workerRoute(
      new Request(`${site}/api/internal/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${workerSecret}` },
      }),
    );
    expect(w.status).toBe(200);
    expect(await order(r.body.orderId)).toMatchObject({ status: "paid" });
  });

  it("7. refuses stale, tampered or incomplete submissions without creating orders", async () => {
    const q = await quote();
    const base = {
      market: "PH",
      items: items(),
      address,
      terms: true,
      termsVersion: "2026-11-draft",
      idempotencyKey: crypto.randomUUID(),
      quoteHash: q.body.quoteHash,
      payment: { gateway: "xendit", channel: "GCASH" },
    };
    const count = async () =>
      Number((await row("select count(*) from public.orders")).count);
    const n = await count();
    // Price changed after the review: the old quote no longer matches.
    await pg.exec(
      `update public.product_offers set retail_minor=123460 where product_id='${ids.product}' and market='PH'`,
    );
    expect(
      (
        await checkoutRoute(
          json({ ...base, idempotencyKey: crypto.randomUUID() }),
        )
      ).status,
    ).toBe(409);
    await pg.exec(
      `update public.product_offers set retail_minor=123450 where product_id='${ids.product}' and market='PH'`,
    );
    expect(
      (await checkoutRoute(json({ ...base, quoteHash: undefined }))).status,
    ).toBe(409);
    expect(
      (await checkoutRoute(json({ ...base, termsVersion: "old-terms" })))
        .status,
    ).toBe(409);
    expect((await checkoutRoute(json({ ...base, terms: false }))).status).toBe(
      400,
    );
    expect(
      (
        await checkoutRoute(
          json({ ...base, address: { ...address, country: "SG" } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await checkoutRoute(
          json({ ...base, payment: { gateway: "xendit", channel: "PAYMAYA" } }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await checkoutRoute(json({ ...base, payment: { gateway: "paypal" } })))
        .status,
    ).toBe(400);
    expect(
      (await checkoutRoute(json(base, "https://evil.example"))).status,
    ).toBe(403);
    holder.user = null;
    expect((await checkoutRoute(json(base))).status).toBe(401);
    expect(
      (await quoteRoute(json({ market: "PH", items: items() }))).status,
    ).toBe(401);
    // None of these created an order or held stock.
    expect(await count()).toBe(n);
  });

  it("8. refuses more than the available stock", async () => {
    const r = await quote(items(24));
    expect(r.status).toBe(409);
  });

  it("9. another customer cannot resume or read someone else's order", async () => {
    const r = await checkout();
    holder.user = { id: ids.other };
    expect((await resumeRoute(json({ orderId: r.body.orderId }))).status).toBe(
      404,
    );
    expect(await status(r.body.orderId)).toBeNull();
  });

  it("10. a forged webhook changes nothing", async () => {
    const r = await checkout();
    const s = fake.sessions.get(sessionId(r.body.url))!;
    fake.pay(s.id);
    expect(
      (
        await hook(
          "payment_session.completed",
          s,
          "forged-token-forged-token-forged",
        )
      ).status,
    ).toBe(401);
    expect(await order(r.body.orderId)).toMatchObject({
      payment_status: "pending",
    });
  });
});
