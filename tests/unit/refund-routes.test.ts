import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  stripe: vi.fn(),
  xendit: vi.fn(),
  token: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
  retrieve: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/services/stripe-payments", () => ({
  paymentClients: f.stripe,
  verifyStripeEvent: f.verify,
  reconcileStripeSession: vi.fn(),
}));
vi.mock("@/services/xendit-payments", () => ({
  xenditClients: f.xendit,
  verifyCallbackToken: f.token,
  toMajor: (n: number) => n / 100,
  toMinor: (n: number) => Math.round(n * 100),
}));
import { POST as worker } from "@/app/api/internal/refunds/route";
import { POST as xWebhook } from "@/app/api/webhooks/refunds/xendit/route";
import { POST as sWebhook } from "@/app/api/webhooks/payments/route";
const id = "92000000-0000-4000-8000-000000000001",
  orderId = "92000000-0000-4000-8000-000000000002";
const job = {
  id,
  orderId,
  lease: null,
  firstSubmission: false,
  firstDispatchedAt: new Date().toISOString(),
  gateway: "xendit",
  livemode: false,
  paymentId: "py-qa",
  subAccountId: "qa_merchant",
  providerRefundId: null,
  amountMinor: 100,
  currency: "PHP",
};
const request = (
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) =>
  new Request(`https://example.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("REFUNDS_ENABLED", "true");
  vi.stubEnv("REFUNDS_LIVE_APPROVED", "false");
  vi.stubEnv("REFUND_WORKER_SECRET", "q".repeat(32));
  f.token.mockReturnValue(true);
  f.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "order_refund_job"
        ? job
        : name === "claim_order_refunds"
          ? []
          : "succeeded",
    error: null,
  }));
  f.fetch.mockResolvedValue(
    Response.json({
      refund_id: "rfd-92000000-0000-4000-8000-000000000003",
      reference_id: `riway-refund:${id}`,
      payment_id: job.paymentId,
      amount: 1,
      currency: "PHP",
      status: "SUCCEEDED",
    }),
  );
  f.xendit.mockReturnValue({
    config: {
      livemode: false,
      key: "qa",
      apiBase: "https://api.xendit.co",
      webhookToken: "qa-token",
    },
    fetch: f.fetch,
    database: { rpc: f.rpc },
  });
  f.stripe.mockImplementation(() => {
    throw Error("not configured");
  });
});
afterEach(() => vi.unstubAllEnvs());
it("keeps disabled or unauthenticated dispatch away from provider clients", async () => {
  vi.stubEnv("REFUNDS_ENABLED", "false");
  expect((await worker(request("/api/internal/refunds"))).status).toBe(503);
  vi.stubEnv("REFUNDS_ENABLED", "true");
  expect((await worker(request("/api/internal/refunds"))).status).toBe(401);
  expect(f.stripe).not.toHaveBeenCalled();
  expect(f.xendit).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
it("requires separate live approval before claiming any live refunds", async () => {
  f.stripe.mockReturnValue({
    config: { livemode: true },
    database: { rpc: f.rpc },
  });
  expect(
    (
      await worker(
        request(
          "/api/internal/refunds",
          {},
          { Authorization: `Bearer ${"q".repeat(32)}` },
        ),
      )
    ).status,
  ).toBe(503);
  expect(f.rpc).not.toHaveBeenCalled();
});
it("processes a configured test gateway independently of an absent second gateway", async () => {
  const r = await worker(
    request(
      "/api/internal/refunds",
      {},
      { Authorization: `Bearer ${"q".repeat(32)}` },
    ),
  );
  expect(r.status).toBe(200);
  expect(f.rpc).toHaveBeenCalledWith("claim_order_refunds", {
    p_gateway: "xendit",
    p_live: false,
    p_limit: 10,
  });
  expect(f.fetch).not.toHaveBeenCalled();
});
it("rejects unverified Xendit callbacks before ledger access", async () => {
  f.token.mockReturnValue(false);
  expect((await xWebhook(request("/api/webhooks/refunds/xendit"))).status).toBe(
    401,
  );
  expect(f.rpc).not.toHaveBeenCalled();
});
it("retrieves canonical Xendit facts instead of trusting callback money or status", async () => {
  const r = await xWebhook(
    request("/api/webhooks/refunds/xendit", {
      event: "refund.failed",
      data: {
        id: "rfd-92000000-0000-4000-8000-000000000003",
        reference_id: `riway-refund:${id}`,
        amount: 999,
        status: "FAILED",
      },
    }),
  );
  expect(r.status).toBe(200);
  expect(f.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/v3/refunds/rfd-"),
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ "for-user-id": "qa_merchant" }),
    }),
  );
  expect(f.rpc).toHaveBeenCalledWith(
    "apply_order_refund",
    expect.objectContaining({
      p_amount: 100,
      p_phase: "succeeded",
      p_payment_id: job.paymentId,
    }),
  );
});
it("returns a retryable status on canonical mismatch without applying money", async () => {
  f.fetch.mockResolvedValue(
    Response.json({
      refund_id: "rfd-92000000-0000-4000-8000-000000000003",
      reference_id: `riway-refund:${id}`,
      payment_id: "py_someone_else",
      amount: 1,
      currency: "PHP",
      status: "SUCCEEDED",
    }),
  );
  expect(
    (
      await xWebhook(
        request("/api/webhooks/refunds/xendit", {
          event: "refund.succeeded",
          data: {
            id: "rfd-92000000-0000-4000-8000-000000000003",
            reference_id: `riway-refund:${id}`,
          },
        }),
      )
    ).status,
  ).toBe(503);
  expect(f.rpc.mock.calls.some((c) => c[0] === "apply_order_refund")).toBe(
    false,
  );
});
it("keeps Stripe signature failures away from refund data", async () => {
  f.stripe.mockReturnValue({ database: { rpc: f.rpc } });
  f.verify.mockRejectedValue(Error("signature"));
  expect((await sWebhook(request("/api/webhooks/payments"))).status).toBe(400);
  expect(f.rpc).not.toHaveBeenCalled();
});
it("settles a signed Stripe event only from a retrieved refund with matching metadata", async () => {
  f.stripe.mockReturnValue({
    config: { livemode: false },
    database: { rpc: f.rpc },
    stripe: { refunds: { retrieve: f.retrieve } },
  });
  f.verify.mockResolvedValue({
    type: "refund.updated",
    data: { object: { id: "re_qa", metadata: { refund_request_id: id } } },
  });
  f.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "order_refund_job"
        ? { ...job, gateway: "stripe", paymentId: "pi_qa", subAccountId: null }
        : "succeeded",
    error: null,
  }));
  f.retrieve.mockResolvedValue({
    id: "re_qa",
    payment_intent: "pi_qa",
    amount: 100,
    currency: "php",
    status: "succeeded",
    metadata: { refund_request_id: id, order_id: orderId },
  });
  expect((await sWebhook(request("/api/webhooks/payments"))).status).toBe(200);
  expect(f.retrieve).toHaveBeenCalledWith("re_qa");
  expect(f.rpc).toHaveBeenCalledWith(
    "apply_order_refund",
    expect.objectContaining({ p_phase: "succeeded", p_amount: 100 }),
  );
});
