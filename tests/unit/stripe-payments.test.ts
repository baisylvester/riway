import { describe, it, expect, vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only", () => ({}));
import {
  stripeConfiguration,
  stripeReadiness,
} from "../../src/lib/stripe-config";
import {
  checkoutParameters,
  checkedCheckoutUrl,
  startStripeCheckout,
  reconcileStripeSession,
  verifyStripeEvent,
  type StripeAttempt,
  paymentClients,
} from "../../src/services/stripe-payments";
import { runPaymentSchedule } from "../../deployment/scheduled-payments";

const env = {
  PAYMENT_PROVIDER: "stripe",
  STRIPE_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  NEXT_PUBLIC_SITE_URL: "https://riway.example.invalid",
  PAYMENT_WORKER_SECRET: "x".repeat(32),
};
const attempt: StripeAttempt = {
  id: "60000000-0000-4000-8000-000000000001",
  orderId: "60000000-0000-4000-8000-000000000002",
  livemode: false,
  amount: 20000,
  currency: "php",
  origin: env.NEXT_PUBLIC_SITE_URL,
  items: [{ name: "Public fixture", quantity: 2, unitAmount: 10000 }],
  expiresAt: Math.floor(Date.now() / 1000) + 2400,
  sessionId: null,
  url: null,
  phase: "preparing",
};
const session = {
  id: "cs_test_fixture",
  url: "https://checkout.stripe.com/c/pay/fixture",
  mode: "payment",
  livemode: false,
  client_reference_id: attempt.orderId,
  metadata: { order_id: attempt.orderId, checkout_id: attempt.id },
  amount_total: 20000,
  currency: "php",
  payment_intent: "pi_fixture",
  status: "complete",
  payment_status: "paid",
};
function clients(data = attempt) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "prepare_stripe_checkout" ? data : "paid",
    error: null as unknown,
  }));
  const create = vi.fn(async () => session),
    retrieve = vi.fn(async () => session);
  const sdk = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const value = {
    config: stripeConfiguration(env),
    database: { rpc },
    stripe: {
      checkout: { sessions: { create, retrieve } },
      webhooks: sdk.webhooks,
    },
  };
  return {
    rpc,
    create,
    retrieve,
    value: value as unknown as ReturnType<typeof paymentClients>,
  };
}
describe("Stripe configuration and checkout", () => {
  it("keeps checkout disabled until explicitly configured", () => {
    expect(stripeReadiness({})).toMatchObject({ enabled: false });
    expect(
      stripeReadiness({ ...env, STRIPE_SECRET_KEY: undefined }),
    ).toMatchObject({ enabled: false });
    expect(
      stripeReadiness({ ...env, PAYMENT_WORKER_SECRET: undefined }),
    ).toMatchObject({ enabled: false });
    expect(stripeReadiness(env)).toMatchObject({ enabled: true, mode: "test" });
  });
  it("rejects mode/key mismatches and requires final live approval without disabling settlement", () => {
    expect(() =>
      stripeConfiguration({ ...env, STRIPE_MODE: "live" }),
    ).toThrow();
    const live = {
      ...env,
      STRIPE_MODE: "live",
      STRIPE_SECRET_KEY: "sk_live_fixture",
    };
    expect(stripeConfiguration(live).livemode).toBe(true);
    expect(stripeReadiness(live).enabled).toBe(false);
    expect(
      stripeReadiness({
        ...live,
        STRIPE_LIVE_APPROVED: "true",
        COMMERCE_TERMS_VERSION: "approved-v1",
      }).enabled,
    ).toBe(true);
  });
  it.each([
    "http://riway.example.invalid",
    "https://riway.example.invalid/path",
    "https://user:pass@riway.example.invalid",
  ])("rejects unsafe return origins", (site) =>
    expect(() =>
      stripeConfiguration({ ...env, NEXT_PUBLIC_SITE_URL: site }),
    ).toThrow(),
  );
  it.each([
    "https://checkout.stripe.com.evil.invalid/pay",
    "javascript:alert(1)",
    "https://evil.invalid/pay",
    "http://checkout.stripe.com/pay",
    "https://x@checkout.stripe.com/pay",
  ])("rejects an unsafe hosted destination", (url) =>
    expect(() => checkedCheckoutUrl(url)).toThrow(),
  );
  it("uses immutable database prices, fixed expiry and server return URLs", () => {
    const params = checkoutParameters(attempt);
    expect(params).toMatchObject({
      mode: "payment",
      expires_at: attempt.expiresAt,
      client_reference_id: attempt.orderId,
      metadata: { checkout_id: attempt.id },
    });
    expect(params.line_items).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: "php",
          unit_amount: 10000,
          product_data: { name: "Public fixture" },
        },
      },
    ]);
    expect(() => checkoutParameters({ ...attempt, amount: 1 })).toThrow(
      /total/,
    );
  });
  it("retries ambiguous session persistence with identical parameters and idempotency key", async () => {
    const c = clients();
    let binds = 0;
    c.rpc.mockImplementation(async (name) => ({
      data: name === "prepare_stripe_checkout" ? attempt : "paid",
      error: name === "bind_stripe_checkout" && binds++ === 0 ? {} : null,
    }));
    await expect(
      startStripeCheckout(attempt.orderId, "owner", c.value),
    ).rejects.toThrow(/recorded/);
    await expect(
      startStripeCheckout(attempt.orderId, "owner", c.value),
    ).resolves.toMatchObject({ url: session.url });
    expect(c.create.mock.calls).toHaveLength(2);
    expect(c.create.mock.calls[0]).toEqual(c.create.mock.calls[1]);
    expect(c.create.mock.calls[0]).toEqual([
      checkoutParameters(attempt),
      { idempotencyKey: `riway-checkout-${attempt.id}` },
    ]);
    expect(c.rpc.mock.calls[0]).toEqual([
      "prepare_stripe_checkout",
      {
        p_order: attempt.orderId,
        p_user: "owner",
        p_live: false,
        p_origin: env.NEXT_PUBLIC_SITE_URL,
      },
    ]);
  });
  it("does not create another session for a bound or paid order", async () => {
    const bound = clients({
      ...attempt,
      phase: "open",
      sessionId: session.id,
      url: session.url,
    });
    await expect(
      startStripeCheckout(attempt.orderId, "owner", bound.value),
    ).resolves.toMatchObject({ url: session.url });
    expect(bound.create).not.toHaveBeenCalled();
    const paid = clients({ ...attempt, phase: "paid" });
    await expect(
      startStripeCheckout(attempt.orderId, "owner", paid.value),
    ).resolves.toMatchObject({ state: "paid" });
    expect(paid.create).not.toHaveBeenCalled();
  });
  it("rejects changed ownership and terminal or wrong-mode attempts before charging", async () => {
    const c = clients();
    c.rpc.mockResolvedValue({
      data: null as unknown as StripeAttempt,
      error: {},
    });
    await expect(
      startStripeCheckout(attempt.orderId, "other", c.value),
    ).rejects.toThrow();
    expect(c.create).not.toHaveBeenCalled();
    for (const data of [
      { ...attempt, phase: "expired" as const },
      { ...attempt, livemode: true },
    ]) {
      const closed = clients(data);
      await expect(
        startStripeCheckout(attempt.orderId, "owner", closed.value),
      ).rejects.toThrow();
      expect(closed.create).not.toHaveBeenCalled();
    }
  });
  it("does not record a session created for another payment mode", async () => {
    const c = clients();
    c.create.mockResolvedValue({ ...session, livemode: true });
    await expect(
      startStripeCheckout(attempt.orderId, "owner", c.value),
    ).rejects.toThrow(/match/);
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});
describe("Stripe signatures and canonical reconciliation", () => {
  const event = {
    id: "evt_fixture",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: session.id } },
  };
  it("verifies raw payload signatures using the official SDK and async Web Crypto", async () => {
    const c = clients(),
      payload = JSON.stringify(event);
    const signature = c.value.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    await expect(
      verifyStripeEvent(payload, signature, c.value),
    ).resolves.toMatchObject({ id: event.id });
    await expect(
      verifyStripeEvent(payload + " ", signature, c.value),
    ).rejects.toThrow();
    const stale = c.value.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 1000,
    });
    await expect(verifyStripeEvent(payload, stale, c.value)).rejects.toThrow();
    const live = JSON.stringify({ ...event, livemode: true });
    await expect(
      verifyStripeEvent(
        live,
        c.value.stripe.webhooks.generateTestHeaderString({
          payload: live,
          secret: env.STRIPE_WEBHOOK_SECRET,
        }),
        c.value,
      ),
    ).rejects.toThrow(/mode/);
  });
  it("retrieves Stripe's canonical session and passes checked amount/currency/references to one transaction", async () => {
    const c = clients();
    await expect(
      reconcileStripeSession(session.id, event.id, false, c.value),
    ).resolves.toBe("paid");
    expect(c.retrieve).toHaveBeenCalledWith(session.id);
    expect(c.rpc).toHaveBeenCalledWith(
      "apply_stripe_checkout_event",
      expect.objectContaining({
        p_amount: 20000,
        p_currency: "php",
        p_payment: "paid",
        p_attempt: attempt.id,
        p_order: attempt.orderId,
        p_session: session.id,
      }),
    );
  });
  it("rejects mismatched references and preserves retryability on database errors", async () => {
    const c = clients();
    c.retrieve.mockResolvedValue({
      ...session,
      client_reference_id: "another-order",
    });
    await expect(
      reconcileStripeSession(session.id, event.id, false, c.value),
    ).rejects.toThrow();
    expect(c.rpc).not.toHaveBeenCalled();
    c.retrieve.mockResolvedValue(session);
    c.rpc.mockResolvedValue({
      data: null as unknown as StripeAttempt,
      error: {},
    });
    await expect(
      reconcileStripeSession(session.id, event.id, false, c.value),
    ).rejects.toThrow(/reconciliation/);
  });
});
describe("Stripe reconciliation scheduler", () => {
  it("is dormant without Stripe but keeps settling after new checkout is disabled", async () => {
    await expect(runPaymentSchedule({})).resolves.toBeUndefined();
    const fetch = vi.fn(async (_request: Request) => new Response("{}"));
    await runPaymentSchedule({
      PAYMENT_PROVIDER: "disabled",
      STRIPE_SECRET_KEY: "sk_test_fixture",
      PAYMENT_WORKER_SECRET: env.PAYMENT_WORKER_SECRET,
      NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL,
      WORKER_SELF_REFERENCE: { fetch },
    });
    const request = fetch.mock.calls[0][0] as unknown as Request;
    expect(request.url).toBe(
      env.NEXT_PUBLIC_SITE_URL + "/api/internal/payments",
    );
    expect(request.headers.get("authorization")).toBe(
      "Bearer " + env.PAYMENT_WORKER_SECRET,
    );
  });
});
