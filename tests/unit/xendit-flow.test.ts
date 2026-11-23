// End-to-end Xendit flows: the real service, webhook and worker routes running
// against the real migrations (PGlite) and an in-memory fake Xendit API that
// enforces account routing (for-user-id), session states and cancellation.
// No network, no real credentials.
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
const holder = vi.hoisted(() => ({ clients: null as unknown }));
vi.mock("@/services/xendit-payments", async (load) => ({
  ...(await load<typeof import("../../src/services/xendit-payments")>()),
  xenditClients: () => holder.clients,
}));
import {
  startXenditCheckout,
  XenditChannelError,
  XenditUncertainError,
  type XenditClients,
} from "../../src/services/xendit-payments";
import { POST as webhook } from "../../src/app/api/webhooks/xendit/route";
import { POST as worker } from "../../src/app/api/internal/payments/route";

const root = resolve(import.meta.dirname, "../..");
const pg = new PGlite();
const token = "flow-callback-token-0123456789abcdef";
const key = "xnd_development_flowfixture";
const subAccount = "sub_ph_test_0001";
const ids = {
  user: "72000000-0000-4000-8000-000000000001",
  sponsor: "72000000-0000-4000-8000-000000000002",
  product: "72000000-0000-4000-8000-000000000003",
};

// ---------- fake Xendit ----------
// Session IDs are unique across the whole run, as they are in Xendit.
let sessionCounter = 0;
type FakeSession = {
  id: string;
  account: string;
  body: Record<string, unknown>;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "CANCELED";
  paymentId: string | null;
};
class FakeXendit {
  sessions = new Map<string, FakeSession>();
  requests: {
    method: string;
    path: string;
    account: string;
    body: Record<string, unknown> | null;
  }[] = [];
  nextCreate: null | "lost" | { status: number; code: string } = null;
  tamperAmount = false;
  reply(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  view(s: FakeSession) {
    return {
      payment_session_id: s.id,
      reference_id: s.body.reference_id,
      status: s.status,
      session_type: s.body.session_type,
      currency: s.body.currency,
      amount: this.tamperAmount ? 1 : s.body.amount,
      country: s.body.country,
      payment_link_url: `https://checkout-staging.xendit.co/sessions/${s.id}`,
      payment_id: s.paymentId,
    };
  }
  create(account: string, body: Record<string, unknown>) {
    const id = `ps-fake${String(++sessionCounter).padStart(6, "0")}`;
    const s: FakeSession = {
      id,
      account,
      body,
      status: "ACTIVE",
      paymentId: null,
    };
    this.sessions.set(id, s);
    return s;
  }
  fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const headers = init.headers as Record<string, string>;
    if (headers.Authorization !== `Basic ${btoa(`${key}:`)}`)
      return this.reply({ error_code: "INVALID_API_KEY" }, 401);
    const account = headers["for-user-id"] ?? "master";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    this.requests.push({
      method: init.method ?? "GET",
      path: u.pathname,
      account,
      body,
    });
    const match = u.pathname.match(
      /^\/sessions\/(ps-[A-Za-z0-9]+)(\/cancel)?$/,
    );
    if (init.method === "POST" && u.pathname === "/sessions") {
      const next = this.nextCreate;
      this.nextCreate = null;
      if (next && next !== "lost")
        return this.reply({ error_code: next.code }, next.status);
      if (Date.parse(String(body.expires_at)) <= Date.now())
        return this.reply({ error_code: "INVALID_EXPIRY" }, 400);
      const s = this.create(account, body);
      if (next === "lost") throw new TypeError("network connection lost");
      return this.reply(this.view(s), 201);
    }
    const s = match ? this.sessions.get(match[1]) : undefined;
    // A session is visible only in the account context that owns it.
    if (!s || s.account !== account)
      return this.reply({ error_code: "NOT_FOUND" }, 404);
    if (match?.[2]) {
      if (s.status !== "ACTIVE")
        return this.reply({ error_code: "INVALID_SESSION_STATUS" }, 422);
      s.status = "CANCELED";
    }
    return this.reply(this.view(s));
  };
  pay(id: string) {
    const s = this.sessions.get(id)!;
    if (s.status !== "ACTIVE")
      throw new Error(`cannot pay ${s.status} session`);
    s.status = "COMPLETED";
    s.paymentId = `py-${id}`;
  }
  expire(id: string) {
    this.sessions.get(id)!.status = "EXPIRED";
  }
}

// ---------- database adapter (service_role RPC over PGlite) ----------
async function asService<T>(fn: () => Promise<T>) {
  await pg.exec("set role service_role");
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
const database = {
  async rpc(name: string, args: Record<string, unknown> = {}) {
    const keys = Object.keys(args);
    const call = `public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")})`;
    try {
      const result = await asService(() =>
        pg.query<Record<string, unknown>>(
          setReturning.has(name)
            ? `select * from ${call}`
            : `select ${call} as r`,
          keys.map((k) => args[k]),
        ),
      );
      return {
        data: setReturning.has(name) ? result.rows : result.rows[0].r,
        error: null,
      };
    } catch (error) {
      return { data: null, error: { message: (error as Error).message } };
    }
  },
  from(table: string) {
    const filters: [string, unknown][] = [];
    let columns = "*";
    const builder = {
      select(c: string) {
        columns = c;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      async maybeSingle() {
        const where = filters.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
        const result = await asService(() =>
          pg.query(
            `select ${columns} from public.${table} where ${where}`,
            filters.map(([, v]) => v),
          ),
        );
        return { data: result.rows[0] ?? null, error: null };
      },
    };
    return builder;
  },
};

let fake: FakeXendit;
let clients: XenditClients;
const site = "https://riway.example.invalid";

async function order(quantity = 1) {
  await pg.exec(
    `select set_config('request.jwt.claims','${JSON.stringify({ sub: ids.user, role: "authenticated", aal: "aal1" })}',false)`,
  );
  await pg.exec("set role authenticated");
  try {
    const r = await pg.query<{ id: string }>(
      `select public.create_order('PH',$1::jsonb,$2::jsonb,gen_random_uuid(),'2026-11-draft') as id`,
      [
        JSON.stringify([{ productId: ids.product, quantity }]),
        JSON.stringify({
          full_name: "Flow QA",
          phone: "0000000000",
          line1: "Flow QA address",
          city: "Manila",
          postal_code: "1000",
          country: "PH",
        }),
      ],
    );
    return r.rows[0].id;
  } finally {
    await pg.exec("reset role");
  }
}
const row = async (sql: string, params: unknown[] = []) =>
  (await pg.query<Record<string, unknown>>(sql, params)).rows[0];
const orderState = (id: string) =>
  row(
    `select o.status,o.payment_status,(select count(*)::int from public.inventory_reservations r where r.order_id=o.id) as holds from public.orders o where o.id=$1`,
    [id],
  );
const onHand = async () =>
  Number(
    (
      await row(
        `select on_hand from public.inventory where product_id=$1 and market='PH'`,
        [ids.product],
      )
    ).on_hand,
  );
const sessionOf = async (orderId: string, attemptNo = 1) =>
  String(
    (
      await row(
        `select session_id from private.xendit_payments where order_id=$1 and attempt_no=$2`,
        [orderId, attemptNo],
      )
    ).session_id,
  );
const hook = (
  event: string,
  sessionId: string,
  reference: string,
  callbackToken = token,
) =>
  webhook(
    new Request(`${site}/api/webhooks/xendit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-callback-token": callbackToken,
      },
      body: JSON.stringify({
        event,
        business_id: "biz",
        data: {
          payment_session_id: sessionId,
          reference_id: reference,
          status: "COMPLETED",
        },
      }),
    }),
  );
const attemptId = async (orderId: string, attemptNo = 1) =>
  String(
    (
      await row(
        `select id from private.xendit_payments where order_id=$1 and attempt_no=$2`,
        [orderId, attemptNo],
      )
    ).id,
  );
// The database is shared across tests; the worker polls only the order under
// test, as other open attempts belong to earlier fake Xendit instances.
const runWorker = async (orderId: string) => {
  await pg.exec(
    `update private.xendit_payments set next_check_at=case when order_id='${orderId}' then now()-interval '1 minute' else now()+interval '1 day' end`,
  );
  return worker(
    new Request(`${site}/api/internal/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${"w".repeat(40)}` },
    }),
  );
};

beforeAll(async () => {
  await pg.exec(
    readFileSync(resolve(root, "tests/security/local-bootstrap.sql"), "utf8"),
  );
  for (const name of readdirSync(resolve(root, "supabase/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await pg.exec(
      readFileSync(resolve(root, "supabase/migrations", name), "utf8"),
    );
  await pg.exec(`
    insert into auth.users(id,email) values('${ids.user}','flow-user@example.invalid'),('${ids.sponsor}','flow-sponsor@example.invalid');
    insert into public.distributor_profiles(user_id,external_member_id,code,display_name,active,verified_at,market)
      values('${ids.sponsor}','${ids.sponsor}','QA-FLOW','Flow QA sponsor',true,now(),'PH');
    insert into public.sponsor_attributions(user_id,distributor_id) values('${ids.user}','${ids.sponsor}');
    insert into public.products(id,slug,name,category,status) values('${ids.product}','flow-qa','Flow QA product','Nutrition','published');
    insert into public.product_offers(product_id,market,currency,retail_minor,regulatory_approved,approval_reference,max_quantity)
      values('${ids.product}','PH','PHP',12345,true,'FLOW-QA',6);
    insert into public.inventory(product_id,market,on_hand) values('${ids.product}','PH',100);
    update public.markets set online_sales_approved=true,payments_ready=true,policy_reference='FLOW-QA-ONLY' where code='PH';
    insert into private.xendit_market_accounts(market,livemode,account_type,sub_account_id,account_status,enabled_channels,payments_enabled)
      values('PH',false,'OWNED','${subAccount}','LIVE','{GCASH,PAYMAYA,BPI_ONLINE_BANKING}',true);
  `);
}, 60000);
afterAll(() => pg.close());
beforeEach(() => {
  fake = new FakeXendit();
  clients = {
    config: {
      mode: "test",
      livemode: false,
      site,
      terms: "2026-11-draft",
      checkoutAllowed: true,
      key,
      webhookToken: token,
      apiBase: "https://api.xendit.co",
      databaseUrl: "",
      databaseKey: "",
    },
    database: database as unknown as XenditClients["database"],
    fetch: fake.fetch as typeof fetch,
  };
  holder.clients = clients;
  vi.stubEnv("PAYMENT_WORKER_SECRET", "w".repeat(40));
  vi.stubEnv("STRIPE_SECRET_KEY", "");
});

describe("Xendit end-to-end flows", () => {
  it("bank channel: routed to the market sub-account, paid once via verified webhook", async () => {
    const id = await order(2);
    const before = await onHand();
    const started = await startXenditCheckout(
      id,
      ids.user,
      "BPI_ONLINE_BANKING",
      clients,
    );
    expect(started.url).toMatch(
      /^https:\/\/checkout-staging\.xendit\.co\/sessions\/ps-fake/,
    );
    const create = fake.requests[0];
    expect(create).toMatchObject({
      method: "POST",
      path: "/sessions",
      account: subAccount,
    });
    expect(create.body).toMatchObject({
      amount: 246.9,
      currency: "PHP",
      country: "PH",
      allowed_payment_channels: ["BPI_ONLINE_BANKING"],
    });

    // Repeated click: same session, no second create.
    await startXenditCheckout(id, ids.user, "BPI_ONLINE_BANKING", clients);
    expect(fake.requests.filter((r) => r.method === "POST")).toHaveLength(1);

    const session = await sessionOf(id);
    const ref = await attemptId(id);
    fake.pay(session);
    // Forged token: rejected, nothing changes.
    expect(
      (
        await hook(
          "payment_session.completed",
          session,
          ref,
          "wrong-token-wrong-token-wrong",
        )
      ).status,
    ).toBe(401);
    expect(await orderState(id)).toMatchObject({
      status: "awaiting_payment",
      payment_status: "pending",
    });
    // Genuine delivery, then a duplicate and an out-of-order expiry.
    expect((await hook("payment_session.completed", session, ref)).status).toBe(
      200,
    );
    expect((await hook("payment_session.completed", session, ref)).status).toBe(
      200,
    );
    expect((await hook("payment_session.expired", session, ref)).status).toBe(
      200,
    );
    expect(await orderState(id)).toMatchObject({
      status: "paid",
      payment_status: "paid",
      holds: 0,
    });
    expect(await onHand()).toBe(before - 2);
    // Status was re-read in the sub-account's context.
    expect(
      fake.requests
        .filter((r) => r.method === "GET")
        .every((r) => r.account === subAccount),
    ).toBe(true);
  });

  it("refuses a session planted in another account under our reference", async () => {
    const id = await order();
    await startXenditCheckout(id, ids.user, "GCASH", clients);
    const ref = await attemptId(id);
    const planted = fake.create("attacker_account", {
      reference_id: ref,
      session_type: "PAY",
      currency: "PHP",
      amount: 123.45,
      country: "PH",
    });
    planted.status = "COMPLETED";
    planted.paymentId = "py-planted";
    expect(
      (await hook("payment_session.completed", planted.id, ref)).status,
    ).toBe(503);
    expect(await orderState(id)).toMatchObject({
      status: "awaiting_payment",
      payment_status: "pending",
    });
  });

  it("refuses a provider amount that differs from the order", async () => {
    const id = await order();
    await startXenditCheckout(id, ids.user, "GCASH", clients);
    const session = await sessionOf(id);
    fake.pay(session);
    fake.tamperAmount = true;
    expect(
      (await hook("payment_session.completed", session, await attemptId(id)))
        .status,
    ).toBe(503);
    expect(await orderState(id)).toMatchObject({ payment_status: "pending" });
    fake.tamperAmount = false;
    expect(
      (await hook("payment_session.completed", session, await attemptId(id)))
        .status,
    ).toBe(200);
    expect(await orderState(id)).toMatchObject({ payment_status: "paid" });
  });

  it("lost create request: reconciled by the worker without double payment", async () => {
    const id = await order();
    fake.nextCreate = "lost";
    await expect(
      startXenditCheckout(id, ids.user, "GCASH", clients),
    ).rejects.toBeInstanceOf(XenditUncertainError);
    const orphan = [...fake.sessions.values()][0];
    expect(
      await row(
        `select phase,session_id from private.xendit_payments where order_id=$1`,
        [id],
      ),
    ).toMatchObject({ phase: "preparing", session_id: null });
    const res = await runWorker(id);
    expect(res.status).toBe(200);
    const bound = await sessionOf(id);
    expect(bound).not.toBe(orphan.id);
    // The orphan (link never shown) expiring must not cancel the order.
    fake.expire(orphan.id);
    expect(
      (await hook("payment_session.expired", orphan.id, await attemptId(id)))
        .status,
    ).toBe(200);
    expect(await orderState(id)).toMatchObject({ status: "awaiting_payment" });
    fake.pay(bound);
    await hook("payment_session.completed", bound, await attemptId(id));
    expect(await orderState(id)).toMatchObject({ status: "paid" });
  });

  it("switching channel cancels the old session; the old link cannot be paid", async () => {
    const id = await order();
    await startXenditCheckout(id, ids.user, "GCASH", clients);
    const old = await sessionOf(id);
    const next = await startXenditCheckout(
      id,
      ids.user,
      "BPI_ONLINE_BANKING",
      clients,
    );
    expect(fake.sessions.get(old)!.status).toBe("CANCELED");
    expect(() => fake.pay(old)).toThrow();
    expect(next.url).toContain(await sessionOf(id, 2));
    expect(await orderState(id)).toMatchObject({
      status: "awaiting_payment",
      holds: 1,
    });
    fake.pay(await sessionOf(id, 2));
    await hook(
      "payment_session.completed",
      await sessionOf(id, 2),
      await attemptId(id, 2),
    );
    expect(await orderState(id)).toMatchObject({ status: "paid" });
  });

  it("channel refused by Xendit: customer can pick another without a new order", async () => {
    const id = await order();
    fake.nextCreate = { status: 400, code: "CHANNEL_NOT_ACTIVATED" };
    await expect(
      startXenditCheckout(id, ids.user, "PAYMAYA", clients),
    ).rejects.toBeInstanceOf(XenditChannelError);
    expect(
      await row(
        `select phase,attention from private.xendit_payments where order_id=$1`,
        [id],
      ),
    ).toMatchObject({
      phase: "canceled",
      attention: expect.stringContaining("CHANNEL_NOT_ACTIVATED"),
    });
    const retry = await startXenditCheckout(id, ids.user, "GCASH", clients);
    expect(retry.state).toBe("open");
  });

  it("rejects channels not enabled for the market before contacting Xendit", async () => {
    const id = await order();
    await expect(
      startXenditCheckout(id, ids.user, "QRPH", clients),
    ).rejects.toBeInstanceOf(XenditChannelError);
    await expect(
      startXenditCheckout(
        id,
        "72000000-0000-4000-8000-0000000000ff",
        "GCASH",
        clients,
      ),
    ).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
  });

  it("expiry releases the order; a late payment is flagged and not fulfilled", async () => {
    const id = await order();
    const before = await onHand();
    await startXenditCheckout(id, ids.user, "GCASH", clients);
    const session = await sessionOf(id);
    fake.expire(session);
    expect(
      (await hook("payment_session.expired", session, await attemptId(id)))
        .status,
    ).toBe(200);
    expect(await orderState(id)).toMatchObject({
      status: "cancelled",
      payment_status: "failed",
      holds: 0,
    });
    // Simulate a late completion reported by Xendit.
    fake.sessions.get(session)!.status = "COMPLETED";
    fake.sessions.get(session)!.paymentId = "py-late";
    expect(
      (await hook("payment_session.completed", session, await attemptId(id)))
        .status,
    ).toBe(200);
    expect(
      await row(`select phase from private.xendit_payments where order_id=$1`, [
        id,
      ]),
    ).toMatchObject({ phase: "review" });
    expect(await onHand()).toBe(before);
  });

  it("worker polls open sessions when a webhook is missed", async () => {
    const id = await order();
    await startXenditCheckout(id, ids.user, "GCASH", clients);
    fake.pay(await sessionOf(id));
    expect((await runWorker(id)).status).toBe(200);
    expect(await orderState(id)).toMatchObject({ status: "paid" });
  });
});
