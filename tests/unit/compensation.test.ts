import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const {
  CompensationDeliveryError,
  compensationAdapter,
  deliverCompensationBatch,
} = await import("@/services/compensation");
const { runCompensationSchedule } =
  await import("../../deployment/scheduled-compensation");

const orderId = "3f8a2c10-1111-4222-8333-444455556666";
const payload = {
  schemaVersion: 1,
  eventType: "order_paid",
  orderId,
  market: "PH",
  currency: "PHP",
  placedAt: "2026-11-24T01:00:00+00:00",
  subtotalMinor: 300,
  discountMinor: 0,
  totalMinor: 300,
  sponsorMemberId: "QA-SPONSOR",
  customerMemberId: null,
  lines: [
    {
      productId: "4f8a2c10-1111-4222-8333-444455556666",
      name: "Sample product",
      quantity: 3,
      unitMinor: 100,
      discountMinor: 0,
      netMinor: 300,
      packageOfferId: null,
    },
  ],
};
const event = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  lease: crypto.randomUUID(),
  eventType: "order_paid",
  externalReference: `riway-web:order:${orderId}:paid`,
  attempts: 1,
  payload,
  ...over,
});

function fakeRpc(events: unknown[], finish: unknown = true) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === "claim_compensation_events")
      return { data: events, error: null };
    return { data: finish, error: null };
  });
  return { rpc, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("compensation adapter factory", () => {
  it("is disabled by default and fail-closed for the RIWAY contract", () => {
    expect(compensationAdapter({})).toBeNull();
    expect(
      compensationAdapter({ COMPENSATION_PROVIDER: "disabled" }),
    ).toBeNull();
    expect(() =>
      compensationAdapter({ COMPENSATION_PROVIDER: "riway" }),
    ).toThrow(/not configured/);
    expect(() =>
      compensationAdapter({ COMPENSATION_PROVIDER: "other" }),
    ).toThrow();
  });
});

describe("deliverCompensationBatch", () => {
  it("acknowledges only with a RIWAY acknowledgement reference and passes the idempotency reference", async () => {
    const { rpc, calls } = fakeRpc([event()]);
    const submit = vi.fn(async () => ({ acknowledgementReference: " ACK-1 " }));
    const result = await deliverCompensationBatch(rpc, { submit });
    expect(submit).toHaveBeenCalledWith({
      externalReference: `riway-web:order:${orderId}:paid`,
      payload,
    });
    expect(result).toMatchObject({ processed: 1, acknowledged: 1 });
    expect(calls[1]).toMatchObject({
      name: "finish_compensation_event",
      args: { p_result: "acknowledged", p_reference: "ACK-1", p_error: null },
    });
  });

  it("retries transient failures and missing acknowledgements", async () => {
    const { rpc, calls } = fakeRpc([event(), event()]);
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new CompensationDeliveryError(true, "timeout"))
      .mockResolvedValueOnce({ acknowledgementReference: "" });
    const result = await deliverCompensationBatch(rpc, { submit });
    expect(result).toMatchObject({ retried: 2, acknowledged: 0 });
    expect(calls[1].args).toMatchObject({
      p_result: "retry",
      p_error: "timeout",
    });
    expect(calls[2].args).toMatchObject({
      p_result: "retry",
      p_error: "missing_acknowledgement",
    });
  });

  it("rejects permanent errors and sanitises codes; unknown errors retry", async () => {
    const { rpc, calls } = fakeRpc([event(), event()]);
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new CompensationDeliveryError(false, "Bad <x>"))
      .mockRejectedValueOnce(new Error("secret token leaked in message"));
    await deliverCompensationBatch(rpc, { submit });
    expect(calls[1].args).toMatchObject({
      p_result: "rejected",
      p_error: "provider_error",
    });
    expect(calls[2].args).toMatchObject({
      p_result: "retry",
      p_error: "provider_unavailable",
    });
    expect(JSON.stringify(calls)).not.toContain("secret token");
  });

  it("never submits a malformed or mismatched snapshot", async () => {
    const { rpc, calls } = fakeRpc([
      event({ payload: { ...payload, totalMinor: 0 } }),
      event({
        eventType: "order_reversed",
        externalReference: `riway-web:order:${orderId}:reversed`,
      }),
      event({
        externalReference: `riway-web:order:${crypto.randomUUID()}:paid`,
      }),
    ]);
    const submit = vi.fn();
    const result = await deliverCompensationBatch(rpc, { submit });
    expect(submit).not.toHaveBeenCalled();
    expect(result.rejected).toBe(3);
    for (const c of calls.slice(1))
      expect(c.args).toMatchObject({
        p_result: "rejected",
        p_error: "invalid_payload",
      });
  });

  it("counts lost leases and throws when the queue is unavailable", async () => {
    const lost = fakeRpc([event()], false);
    const result = await deliverCompensationBatch(lost.rpc, {
      submit: async () => ({ acknowledgementReference: "ACK" }),
    });
    expect(result.persistenceFailures).toBe(1);
    const broken = vi.fn(async () => ({
      data: null,
      error: { code: "42883" },
    }));
    await expect(
      deliverCompensationBatch(broken, { submit: vi.fn() }),
    ).rejects.toThrow("unavailable");
  });
});

describe("compensation worker route", () => {
  const secret = "s".repeat(40);
  const request = (auth = `Bearer ${secret}`) =>
    new Request("https://shop.example.invalid/api/internal/compensation", {
      method: "POST",
      headers: { authorization: auth },
    });

  it("is unavailable when unconfigured, refuses bad tokens and never claims while disabled", async () => {
    const { POST } = await import("@/app/api/internal/compensation/route");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("COMPENSATION_WORKER_SECRET", secret);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.invalid");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect((await POST(request("Bearer wrong"))).status).toBe(401);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const disabled = await POST(request());
    expect(disabled.status).toBe(503);
    vi.stubEnv("COMPENSATION_PROVIDER", "riway");
    const pending = await POST(request());
    expect(pending.status).toBe(503);
    expect(await pending.text()).not.toContain(secret);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("compensation schedule", () => {
  it("does nothing while disabled and requires complete https configuration when enabled", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await runCompensationSchedule({ WORKER_SELF_REFERENCE: { fetch } });
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      runCompensationSchedule({ COMPENSATION_PROVIDER: "riway" }),
    ).rejects.toThrow("incomplete");
    await expect(
      runCompensationSchedule({
        COMPENSATION_PROVIDER: "riway",
        COMPENSATION_WORKER_SECRET: "s".repeat(40),
        NEXT_PUBLIC_SITE_URL: "http://shop.example.invalid",
        WORKER_SELF_REFERENCE: { fetch },
      }),
    ).rejects.toThrow("Invalid");
    await runCompensationSchedule({
      COMPENSATION_PROVIDER: "riway",
      COMPENSATION_WORKER_SECRET: "s".repeat(40),
      NEXT_PUBLIC_SITE_URL: "https://shop.example.invalid",
      WORKER_SELF_REFERENCE: { fetch },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
