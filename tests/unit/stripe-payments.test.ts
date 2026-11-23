import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only", () => ({}));
import {
  checkoutSessionParams,
  settlementFor,
  stripeClient,
  stripeEnabled,
  verifyWebhook,
} from "../../src/services/stripe-payments";

const secret = "whsec_test_unit_secret_0123456789";
const stripe = new Stripe("sk_test_unitTestKey0001");

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_unit_1",
    object: "checkout.session",
    payment_status: "paid",
    amount_total: 20000,
    currency: "php",
    ...overrides,
  };
}
function event(type: string, object: unknown) {
  return {
    id: "evt_test_unit_1",
    object: "event",
    api_version: "2026-10-28.endive",
    created: 1,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("settlement mapping", () => {
  it("settles a completed paid session and ignores completed-but-unpaid sessions", () => {
    expect(settlementFor(event("checkout.session.completed", session())).outcome).toBe("paid");
    expect(
      settlementFor(
        event("checkout.session.completed", session({ payment_status: "unpaid" })),
      ).outcome,
    ).toBe("ignored");
  });

  it("maps delayed payment results and expiry", () => {
    expect(settlementFor(event("checkout.session.async_payment_succeeded", session())).outcome).toBe("paid");
    expect(settlementFor(event("checkout.session.async_payment_failed", session())).outcome).toBe("failed");
    expect(settlementFor(event("checkout.session.expired", session())).outcome).toBe("expired");
  });

  it("ignores unrelated event types", () => {
    expect(settlementFor(event("charge.refunded", session())).outcome).toBe("ignored");
  });
});

describe("hosted checkout request", () => {
  const params = checkoutSessionParams({
    orderId: "00000000-0000-4000-8000-000000000001",
    currency: "PHP",
    lines: [{ name: "x".repeat(300), quantity: 2, unitMinor: 10000 }],
    siteUrl: "https://riway.example.invalid",
    expiresAt: 1_900_000_000,
  });

  it("uses hosted payment mode with server-priced lines and no dynamic-method allowlist", () => {
    expect(params.mode).toBe("payment");
    expect(params).not.toHaveProperty("payment_method_types");
    expect(params).not.toHaveProperty("automatic_tax");
    expect(params.line_items?.[0]).toMatchObject({
      quantity: 2,
      price_data: { currency: "php", unit_amount: 10000 },
    });
    expect(params.line_items?.[0].price_data?.product_data?.name).toHaveLength(250);
    expect(params.expires_at).toBe(1_900_000_000);
  });

  it("returns the shopper to the order page and keeps the order reference", () => {
    expect(params.success_url).toContain("/checkout/return?order=");
    expect(params.success_url).toContain("{CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://riway.example.invalid/checkout?cancelled=1");
    expect(params.metadata).toEqual({ order_id: "00000000-0000-4000-8000-000000000001" });
  });
});

describe("configuration guards", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(stripeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      stripeEnabled({ PAYMENT_PROVIDER: "stripe" } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("rejects malformed or missing keys", () => {
    expect(() => stripeClient({} as NodeJS.ProcessEnv)).toThrow("Stripe is not configured.");
    expect(() =>
      stripeClient({ STRIPE_SECRET_KEY: "pk_test_publishable" } as unknown as NodeJS.ProcessEnv),
    ).toThrow("Stripe is not configured.");
    expect(() =>
      stripeClient({ STRIPE_SECRET_KEY: "rk_test_restricted0001" } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe("webhook signature verification", () => {
  const body = JSON.stringify(event("checkout.session.completed", session()));

  it("accepts a correctly signed payload", async () => {
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret });
    const verified = await verifyWebhook(stripe, body, header, secret);
    expect(verified.type).toBe("checkout.session.completed");
  });

  it("rejects a tampered payload", async () => {
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret });
    const tampered = body.replace('"amount_total":20000', '"amount_total":1');
    await expect(verifyWebhook(stripe, tampered, header, secret)).rejects.toThrow();
  });

  it("rejects a signature made with another secret", async () => {
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: "whsec_other_secret_0123456789",
    });
    await expect(verifyWebhook(stripe, body, header, secret)).rejects.toThrow();
  });
});
