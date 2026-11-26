import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  session: vi.fn(),
  stripeClients: vi.fn(),
  stripeStart: vi.fn(),
  stripeReady: vi.fn(),
  xenditClients: vi.fn(),
  xenditStart: vi.fn(),
  xenditReady: vi.fn(),
  reconcile: vi.fn(),
  referral: vi.fn(),
}));
vi.mock("@/lib/data", () => ({ session: f.session }));
vi.mock("@/lib/referral-continuity", () => ({
  completePendingReferral: f.referral,
}));
vi.mock("@/lib/stripe-config", () => ({ stripeReadiness: f.stripeReady }));
vi.mock("@/services/stripe-payments", () => ({
  paymentClients: f.stripeClients,
  startStripeCheckout: f.stripeStart,
}));
vi.mock("@/lib/xendit-config", async (load) => ({
  ...(await load<typeof import("../../src/lib/xendit-config")>()),
  xenditReadiness: f.xenditReady,
}));
vi.mock("@/services/xendit-payments", async (load) => {
  const real =
    await load<typeof import("../../src/services/xendit-payments")>();
  return {
    XenditChannelError: real.XenditChannelError,
    verifyCallbackToken: real.verifyCallbackToken,
    parseSessionWebhook: real.parseSessionWebhook,
    logPaymentError: vi.fn(),
    xenditClients: f.xenditClients,
    startXenditCheckout: f.xenditStart,
    reconcileXenditAttempt: f.reconcile,
  };
});
import { XenditChannelError } from "../../src/services/xendit-payments";
import { POST as checkout } from "../../src/app/api/checkout/route";
import { POST as webhook } from "../../src/app/api/webhooks/xendit/route";

const orderId = "71000000-0000-4000-8000-000000000001",
  userId = "71000000-0000-4000-8000-000000000002",
  attemptId = "71000000-0000-4000-8000-000000000003",
  token = "x".repeat(40);
const input = {
  market: "PH",
  items: [{ productId: "71000000-0000-4000-8000-000000000004", quantity: 1 }],
  address: {
    full_name: "Public QA Fixture",
    phone: "0000000000",
    line1: "Public fixture address",
    city: "Manila",
    postal_code: "1000",
    country: "PH",
  },
  terms: true,
  termsVersion: "qa-terms-v1",
  idempotencyKey: orderId,
  quoteHash: "a".repeat(64),
};
const post = (body: unknown) =>
  new Request("https://riway.example.invalid/api/checkout", {
    method: "POST",
    headers: {
      Origin: "https://riway.example.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const hook = (body: unknown, callbackToken: string | null = token) =>
  new Request("https://riway.example.invalid/api/webhooks/xendit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(callbackToken ? { "x-callback-token": callbackToken } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const completed = {
  event: "payment_session.completed",
  business_id: "biz_fixture",
  data: {
    payment_session_id: "ps-fixture0001",
    reference_id: attemptId,
    status: "COMPLETED",
    amount: 1,
  },
};

let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_PROVIDERS", "stripe,xendit");
  rpc = vi.fn(async (name: string) =>
    name === "xendit_checkout_channels"
      ? { data: ["GCASH", "BPI_ONLINE_BANKING"], error: null }
      : { data: orderId, error: null },
  );
  f.session.mockResolvedValue({
    user: { id: userId },
    contactVerified: true,
    client: { rpc },
  });
  f.referral.mockResolvedValue({ state: "none", message: "" });
  f.stripeClients.mockReturnValue({ config: { terms: "qa-terms-v1" } });
  f.stripeReady.mockReturnValue({ enabled: true });
  f.xenditClients.mockReturnValue({
    config: { terms: "qa-terms-v1", webhookToken: token },
  });
  f.xenditReady.mockReturnValue({ enabled: true });
  f.stripeStart.mockResolvedValue({
    orderId,
    url: "https://checkout.stripe.com/c/pay/x",
  });
  f.xenditStart.mockResolvedValue({
    orderId,
    url: "https://checkout-staging.xendit.co/sessions/ps-1",
  });
  f.reconcile.mockResolvedValue("paid");
});

describe("checkout gateway selection", () => {
  it("keeps Stripe as the default gateway", async () => {
    expect((await checkout(post(input))).status).toBe(200);
    expect(f.stripeStart).toHaveBeenCalledWith(
      orderId,
      userId,
      expect.anything(),
    );
    expect(f.xenditStart).not.toHaveBeenCalled();
  });
  it("starts Xendit with only the customer's channel choice", async () => {
    const r = await checkout(
      post({
        ...input,
        payment: {
          gateway: "xendit",
          channel: "BPI_ONLINE_BANKING",
          subAccountId: "attacker",
          amount: 1,
        },
      }),
    );
    expect(r.status).toBe(200);
    expect(f.xenditStart).toHaveBeenCalledWith(
      orderId,
      userId,
      "BPI_ONLINE_BANKING",
      expect.anything(),
    );
    // The order RPC never receives browser-supplied amounts or routing.
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("attacker");
  });
  it("refuses a gateway that is not configured before creating an order", async () => {
    vi.stubEnv("PAYMENT_PROVIDERS", "stripe");
    const r = await checkout(
      post({ ...input, payment: { gateway: "xendit", channel: "GCASH" } }),
    );
    expect(r.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses Xendit while its configuration is incomplete", async () => {
    f.xenditReady.mockReturnValue({ enabled: false });
    const r = await checkout(
      post({ ...input, payment: { gateway: "xendit", channel: "GCASH" } }),
    );
    expect(r.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("refuses an unavailable method before creating an order", async () => {
    for (const channel of ["PAYMAYA", "CIMB_FPX"]) {
      const r = await checkout(
        post({ ...input, payment: { gateway: "xendit", channel } }),
      );
      expect(r.status).toBe(409);
    }
    expect(rpc).not.toHaveBeenCalledWith(
      "create_membership_commerce_order",
      expect.anything(),
    );
    expect(f.xenditStart).not.toHaveBeenCalled();
  });
  it("rejects malformed channel codes", async () => {
    const r = await checkout(
      post({
        ...input,
        payment: { gateway: "xendit", channel: "gcash; drop" },
      }),
    );
    expect(r.status).toBe(400);
  });
  it("reports an unavailable bank channel as a conflict", async () => {
    f.xenditStart.mockRejectedValue(
      new XenditChannelError("BPI cannot be used for this order total."),
    );
    const r = await checkout(
      post({
        ...input,
        payment: { gateway: "xendit", channel: "BPI_ONLINE_BANKING" },
      }),
    );
    expect(r.status).toBe(409);
    expect((await r.json()).error.message).toMatch(/BPI/);
  });
  it("does not claim payment when the provider call fails", async () => {
    f.xenditStart.mockRejectedValue(new Error("timeout"));
    const r = await checkout(
      post({ ...input, payment: { gateway: "xendit", channel: "GCASH" } }),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).error.message).toMatch(/No payment is confirmed/);
  });
});

describe("xendit webhook", () => {
  it("rejects forged or missing callback tokens without touching state", async () => {
    expect((await webhook(hook(completed, "y".repeat(40)))).status).toBe(401);
    expect((await webhook(hook(completed, null))).status).toBe(401);
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("re-reads the session and applies it under a deduplication key", async () => {
    const r = await webhook(hook(completed));
    expect(r.status).toBe(200);
    expect(f.reconcile).toHaveBeenCalledWith(
      attemptId,
      "payment_session.completed:ps-fixture0001",
      expect.anything(),
      "ps-fixture0001",
    );
  });
  it("acknowledges duplicates and out-of-order deliveries the database already handled", async () => {
    f.reconcile
      .mockResolvedValueOnce("duplicate")
      .mockResolvedValueOnce("paid");
    expect((await webhook(hook(completed))).status).toBe(200);
    expect(
      (await webhook(hook({ ...completed, event: "payment_session.expired" })))
        .status,
    ).toBe(200);
  });
  it("ignores other events and foreign references", async () => {
    expect(
      (await webhook(hook({ ...completed, event: "payment.capture" }))).status,
    ).toBe(200);
    expect(
      (
        await webhook(
          hook({
            ...completed,
            data: { ...completed.data, reference_id: "INV-123" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("asks Xendit to retry when reconciliation fails", async () => {
    f.reconcile.mockRejectedValue(new Error("Payment does not match order"));
    expect((await webhook(hook(completed))).status).toBe(503);
  });
  it("rejects malformed payloads", async () => {
    expect((await webhook(hook("not json"))).status).toBe(400);
    expect(
      (
        await webhook(
          hook({
            event: "payment_session.completed",
            data: { payment_session_id: "bad" },
          }),
        )
      ).status,
    ).toBe(400);
  });
});
