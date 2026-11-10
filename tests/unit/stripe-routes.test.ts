import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  session: vi.fn(),
  clients: vi.fn(),
  start: vi.fn(),
  verify: vi.fn(),
  reconcile: vi.fn(),
  ready: vi.fn(),
  referral: vi.fn(),
}));
vi.mock("@/lib/data", () => ({ session: f.session }));
vi.mock("@/lib/referral-continuity", () => ({
  completePendingReferral: f.referral,
}));
vi.mock("@/lib/stripe-config", () => ({ stripeReadiness: f.ready }));
vi.mock("@/services/stripe-payments", () => ({
  paymentClients: f.clients,
  startStripeCheckout: f.start,
  verifyStripeEvent: f.verify,
  reconcileStripeSession: f.reconcile,
}));
import { POST as checkout } from "../../src/app/api/checkout/route";
import { POST as webhook } from "../../src/app/api/webhooks/payments/route";
import { POST as resume } from "../../src/app/api/payments/resume/route";
const orderId = "60000000-0000-4000-8000-000000000002",
  userId = "60000000-0000-4000-8000-000000000003";
const input = {
  market: "PH",
  items: [{ productId: "60000000-0000-4000-8000-000000000004", quantity: 1 }],
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
};
const request = (
  body: unknown = input,
  origin = "https://riway.example.invalid",
) =>
  new Request("https://riway.example.invalid/api/checkout", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
let rpc: ReturnType<typeof vi.fn>, maybeSingle: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  rpc = vi.fn(async () => ({ data: orderId, error: null }));
  maybeSingle = vi.fn(async () => ({ data: { id: orderId }, error: null }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  f.session.mockResolvedValue({
    user: { id: userId },
    client: { rpc, from: vi.fn(() => query) },
  });
  f.clients.mockReturnValue({ config: { terms: "qa-terms-v1" } });
  f.ready.mockReturnValue({ enabled: true });
  f.referral.mockResolvedValue({ state: "none", message: "" });
  f.start.mockResolvedValue({
    orderId,
    url: "https://checkout.stripe.com/c/pay/fixture",
  });
  f.verify.mockResolvedValue({
    id: "evt_fixture",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_fixture", amount_total: 1 } },
  });
  f.reconcile.mockResolvedValue("paid");
});
describe("checkout authority boundaries", () => {
  it("rejects origin, invalid input and unauthenticated requests before order creation", async () => {
    expect(
      (await checkout(request(input, "https://evil.invalid"))).status,
    ).toBe(403);
    expect((await checkout(request({}))).status).toBe(400);
    f.session.mockResolvedValue({ user: null });
    expect((await checkout(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("rejects missing configuration and changed terms without reserving stock", async () => {
    f.ready.mockReturnValue({ enabled: false });
    expect((await checkout(request())).status).toBe(503);
    f.ready.mockReturnValue({ enabled: true });
    expect(
      (await checkout(request({ ...input, termsVersion: "outdated" }))).status,
    ).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("keeps market/pricing/stock/sponsor authorization in the user-scoped database RPC", async () => {
    const r = await checkout(
      request({ ...input, total: 1, currency: "usd", sponsor_id: "forged" }),
    );
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_order", {
      m: "PH",
      items: input.items,
      delivery: input.address,
      key: input.idempotencyKey,
      terms: "qa-terms-v1",
    });
    expect(f.start).toHaveBeenCalledWith(
      orderId,
      userId,
      f.clients.mock.results[0].value,
    );
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("resolves a saved introduction before order creation and preserves a retry after failure", async () => {
    f.referral.mockRejectedValueOnce(Error("private referral failure"));
    const failed = await checkout(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private referral failure");
    expect(rpc).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
    f.referral.mockResolvedValueOnce({
      state: "invalid",
      message: "Saved introduction cleared.",
    });
    expect((await checkout(request())).status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
    f.referral.mockResolvedValueOnce({ state: "linked", message: "Linked." });
    expect((await checkout(request())).status).toBe(200);
    expect(f.referral).toHaveBeenCalledWith(expect.objectContaining({ rpc }));
    expect(f.referral.mock.invocationCallOrder.at(-1)).toBeLessThan(
      rpc.mock.invocationCallOrder[0],
    );
  });
  it("does not contact Stripe after a rejected order and treats network outcomes as uncertain", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Market not ready" },
    });
    expect((await checkout(request())).status).toBe(409);
    expect(f.start).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: orderId, error: null });
    f.start.mockRejectedValue(Error("fixture network failure"));
    const r = await checkout(request());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("fixture network failure");
  });
  it("resumes only the authenticated customer's order", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await resume(request({ orderId }))).status).toBe(404);
    expect(f.start).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValue({ data: { id: orderId }, error: null });
    expect((await resume(request({ orderId }))).status).toBe(200);
    expect(f.start).toHaveBeenCalledWith(orderId, userId);
  });
});
describe("Stripe webhook acknowledgement", () => {
  const eventRequest = () =>
    new Request("https://riway.example.invalid/api/webhooks/payments", {
      method: "POST",
      headers: { "stripe-signature": "signed-fixture" },
      body: '{"fixture":"raw body"}',
    });
  it("requires valid raw-body verification before reconciliation", async () => {
    f.verify.mockRejectedValue(Error("bad signature"));
    expect((await webhook(eventRequest())).status).toBe(400);
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("passes the raw body to verification and retrieves canonical data by session ID", async () => {
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(f.verify).toHaveBeenCalledWith(
      '{"fixture":"raw body"}',
      "signed-fixture",
      expect.anything(),
    );
    expect(f.reconcile).toHaveBeenCalledWith(
      "cs_test_fixture",
      "evt_fixture",
      false,
      expect.anything(),
    );
  });
  it("returns a retryable response on reconciliation failure and ignores unrelated events", async () => {
    f.reconcile.mockRejectedValue(Error("fixture database unavailable"));
    expect((await webhook(eventRequest())).status).toBe(503);
    f.verify.mockResolvedValue({ id: "evt_other", type: "customer.created" });
    f.reconcile.mockClear();
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("processes settlement even when checkout has been disabled", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "disabled");
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(f.reconcile).toHaveBeenCalledTimes(1);
  });
});
