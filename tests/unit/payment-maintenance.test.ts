import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  clients: vi.fn(),
  rpc: vi.fn(),
  reconcile: vi.fn(),
  start: vi.fn(),
}));
vi.mock("@/services/stripe-payments", () => ({
  paymentClients: f.clients,
  reconcileStripeSession: f.reconcile,
  startStripeCheckout: f.start,
}));
import { POST } from "../../src/app/api/internal/payments/route";

const secret = "payment-maintenance-fixture-secret-with-32-characters";
const attempt = "75000000-0000-4000-8000-000000000001",
  order = "75000000-0000-4000-8000-000000000002",
  user = "75000000-0000-4000-8000-000000000003";
const request = (token = secret) =>
  new Request("https://riway.example.invalid/api/internal/payments", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_WORKER_SECRET", secret);
  vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  f.clients.mockReturnValue({
    config: { livemode: false, checkoutAllowed: true },
    database: { rpc: f.rpc },
  });
  f.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "pending_stripe_checkouts"
        ? []
        : name === "release_expired_reservations"
          ? 2
          : null,
    error: null,
  }));
  f.reconcile.mockResolvedValue("paid");
  f.start.mockResolvedValue({ state: "open" });
});
afterEach(() => vi.unstubAllEnvs());

describe("configured payment reservation maintenance", () => {
  it("does not initialize providers or touch stock before worker authentication", async () => {
    expect((await POST(request("incorrect"))).status).toBe(401);
    vi.stubEnv("PAYMENT_WORKER_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    expect(f.clients).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("does not clean or claim work when transport configuration is incomplete", async () => {
    f.clients.mockImplementation(() => {
      throw Error("private credential detail");
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private credential detail");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("expires orphan reservations even when no Stripe attempt can enter the queue", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(f.rpc.mock.calls.map((call) => call[0])).toEqual([
      "release_expired_reservations",
      "pending_stripe_checkouts",
    ]);
    expect(f.rpc).toHaveBeenNthCalledWith(2, "pending_stripe_checkouts", {
      p_live: false,
    });
    expect(await response.json()).toEqual({
      expired: 2,
      checked: 0,
      failed: 0,
    });
    expect(f.start).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it.each([null, "2", -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses a malformed cleanup count %s without claiming the queue",
    async (data) => {
      f.rpc.mockResolvedValue({ data, error: null });
      expect((await POST(request())).status).toBe(503);
      expect(f.rpc.mock.calls.map((call) => call[0])).toEqual([
        "release_expired_reservations",
      ]);
    },
  );
  it("retains the queue for retry when cleanup is rejected or throws", async () => {
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "private SQL detail" },
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private SQL detail");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    f.rpc.mockReset().mockRejectedValue(Error("fixture transport failure"));
    expect((await POST(request())).status).toBe(503);
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("continues configured settlement while creation is disabled", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "disabled");
    const clients = {
      config: { livemode: true, checkoutAllowed: false },
      database: { rpc: f.rpc },
    };
    f.clients.mockReturnValue(clients);
    f.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "pending_stripe_checkouts"
          ? [
              {
                attempt_id: attempt,
                order_id: order,
                user_id: user,
                session_id: "cs_live_fixture",
              },
            ]
          : 0,
      error: null,
    }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(f.rpc).toHaveBeenNthCalledWith(2, "pending_stripe_checkouts", {
      p_live: true,
    });
    expect(f.reconcile).toHaveBeenCalledWith(
      "cs_live_fixture",
      expect.stringContaining(`poll-${attempt}-`),
      false,
      clients,
    );
    expect(await response.json()).toEqual({
      expired: 0,
      checked: 1,
      failed: 0,
    });
  });
  it("returns retryable queue errors after cleanup without starting provider calls", async () => {
    f.rpc.mockImplementation(async (name: string) =>
      name === "release_expired_reservations"
        ? { data: 1, error: null }
        : { data: null, error: { message: "private queue detail" } },
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private queue detail");
    expect(f.start).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("preserves existing provider retry and attention handling after maintenance", async () => {
    f.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "pending_stripe_checkouts"
          ? [
              {
                attempt_id: attempt,
                order_id: order,
                user_id: user,
                session_id: null,
              },
            ]
          : 0,
      error: null,
    }));
    f.start.mockRejectedValue(Error("private provider failure"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(f.rpc.mock.calls.map((call) => call[0])).toEqual([
      "release_expired_reservations",
      "pending_stripe_checkouts",
      "flag_stripe_reconciliation",
    ]);
    expect(await response.json()).toEqual({
      expired: 0,
      checked: 0,
      failed: 1,
    });
  });
});
