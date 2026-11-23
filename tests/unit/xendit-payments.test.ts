import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  checkedXenditUrl,
  reconcileXenditAttempt,
  sessionParameters,
  startXenditCheckout,
  toMajor,
  toMinor,
  verifyCallbackToken,
  XenditChannelError,
  XenditUncertainError,
  type XenditAttempt,
  type XenditClients,
} from "../../src/services/xendit-payments";
import {
  channelRejection,
  eligibleChannels,
  xenditChannels,
} from "../../src/lib/xendit-channels";
import {
  configuredGateways,
  xenditConfiguration,
  xenditReadiness,
} from "../../src/lib/xendit-config";

const orderId = "70000000-0000-4000-8000-000000000001",
  userId = "70000000-0000-4000-8000-000000000002",
  attemptId = "70000000-0000-4000-8000-000000000003",
  productId = "70000000-0000-4000-8000-000000000004";

const baseAttempt = (over: Partial<XenditAttempt> = {}): XenditAttempt => ({
  id: attemptId,
  orderId,
  attemptNo: 1,
  livemode: false,
  subAccountId: null,
  channel: "GCASH",
  country: "PH",
  amount: 123456,
  currency: "PHP",
  items: [
    {
      referenceId: productId,
      name: "Product × 2",
      category: "Nutrition",
      amount: 123456,
    },
  ],
  origin: "https://riway.example.invalid",
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  sessionId: null,
  url: null,
  phase: "preparing",
  ...over,
});

const session = (over: Record<string, unknown> = {}) => ({
  payment_session_id: "ps-fixture0001",
  reference_id: attemptId,
  status: "ACTIVE",
  session_type: "PAY",
  currency: "PHP",
  amount: 1234.56,
  country: "PH",
  payment_link_url:
    "https://checkout-staging.xendit.co/sessions/ps-fixture0001",
  payment_id: null,
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function harness({
  attempts = [baseAttempt()],
  enabled = ["GCASH", "BPI_ONLINE_BANKING", "PAYMAYA"],
  total = 123456,
  owner = userId,
  context = {
    id: attemptId,
    orderId,
    livemode: false,
    subAccountId: null,
    sessionId: "ps-fixture0001",
  } as Record<string, unknown> | null,
}: {
  attempts?: XenditAttempt[];
  enabled?: string[];
  total?: number;
  owner?: string;
  context?: Record<string, unknown> | null;
} = {}) {
  const queue = [...attempts];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "prepare_xendit_payment":
        return {
          data: queue.length > 1 ? queue.shift() : queue[0],
          error: null,
        };
      case "xendit_checkout_channels":
        return { data: enabled, error: null };
      case "bind_xendit_payment":
      case "supersede_xendit_payment":
      case "reject_xendit_payment":
        return { data: "open", error: null };
      case "xendit_payment_context":
        return { data: context, error: null };
      case "apply_xendit_payment_event":
        return {
          data: args.p_status === "COMPLETED" ? "paid" : "open",
          error: null,
        };
      default:
        throw new Error(`unexpected rpc ${name}`);
    }
  });
  const maybeSingle = vi.fn(async () => ({
    data: { id: orderId, user_id: owner, market: "PH", total_minor: total },
    error: null,
  }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  const fetch = vi.fn();
  const clients = {
    config: {
      livemode: false,
      checkoutAllowed: true,
      key: "xnd_development_fixture",
      apiBase: "https://api.xendit.co",
      site: "https://riway.example.invalid",
    },
    database: { rpc, from: vi.fn(() => query) },
    fetch,
  } as unknown as XenditClients;
  return { clients, rpc, fetch };
}

describe("xendit channel catalogue", () => {
  it("offers only documented channels that an admin enabled and that fit the amount", () => {
    expect(
      eligibleChannels("PH", ["GCASH", "NOT_A_CHANNEL"]).map((c) => c.code),
    ).toEqual(["GCASH"]);
    // QRPH max is PHP 50,000.00
    expect(eligibleChannels("PH", ["QRPH"], 5_000_001)).toEqual([]);
    expect(
      eligibleChannels("PH", ["QRPH"], 5_000_000).map((c) => c.code),
    ).toEqual(["QRPH"]);
    expect(xenditChannels.SG).toEqual([]);
  });
  it("rejects unavailable, foreign-market and out-of-range bank channels", () => {
    expect(
      channelRejection("PH", "BPI_ONLINE_BANKING", ["GCASH"], 10000),
    ).toMatch(/not available/);
    expect(channelRejection("PH", "CIMB_FPX", ["CIMB_FPX"], 10000)).toMatch(
      /not available/,
    );
    expect(channelRejection("MY", "CIMB_FPX", ["CIMB_FPX"], 3_000_001)).toMatch(
      /cannot be used/,
    );
    expect(
      channelRejection(
        "PH",
        "BPI_ONLINE_BANKING",
        ["BPI_ONLINE_BANKING"],
        10000,
      ),
    ).toBeNull();
  });
});

describe("xendit configuration", () => {
  const env = {
    PAYMENT_PROVIDERS: "stripe,xendit",
    XENDIT_MODE: "test",
    XENDIT_SECRET_KEY: "xnd_development_abc123",
    XENDIT_WEBHOOK_TOKEN: "t".repeat(32),
    SUPABASE_SERVICE_ROLE_KEY: "service",
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid",
    NEXT_PUBLIC_SITE_URL: "https://riway.example.invalid",
    PAYMENT_WORKER_SECRET: "w".repeat(32),
  };
  it("keeps the old single-provider setting working", () => {
    expect([
      ...configuredGateways({
        PAYMENT_PROVIDER: "stripe",
        PAYMENT_PROVIDERS: "",
      }),
    ]).toEqual(["stripe"]);
    expect([
      ...configuredGateways({ PAYMENT_PROVIDERS: "stripe, xendit,paypal" }),
    ]).toEqual(["stripe", "xendit"]);
  });
  it("fails closed on mode/key mismatch and blocks live without approval", () => {
    expect(xenditReadiness(env).enabled).toBe(true);
    expect(() =>
      xenditConfiguration({ ...env, XENDIT_SECRET_KEY: "xnd_production_abc" }),
    ).toThrow();
    expect(() =>
      xenditConfiguration({ ...env, XENDIT_WEBHOOK_TOKEN: "" }),
    ).toThrow();
    expect(
      xenditReadiness({
        ...env,
        XENDIT_MODE: "live",
        XENDIT_SECRET_KEY: "xnd_production_abc",
      }).enabled,
    ).toBe(false);
    expect(xenditReadiness({ ...env, PAYMENT_PROVIDERS: "stripe" }).mode).toBe(
      "disabled",
    );
  });
});

describe("xendit money and request shape", () => {
  it("converts minor units exactly", () => {
    expect(toMajor(123456)).toBe(1234.56);
    expect(toMajor(100005)).toBe(1000.05);
    expect(toMinor(1234.56)).toBe(123456);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(() => toMinor(1.005)).toThrow();
  });
  it("restricts the hosted page to the selected channel and uses trusted totals", () => {
    const p = sessionParameters(baseAttempt({ channel: "BPI_ONLINE_BANKING" }));
    expect(p).toMatchObject({
      reference_id: attemptId,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      amount: 1234.56,
      currency: "PHP",
      country: "PH",
      allowed_payment_channels: ["BPI_ONLINE_BANKING"],
      allow_save_payment_method: "DISABLED",
      success_return_url: `https://riway.example.invalid/account/orders/${orderId}?payment=return`,
    });
    expect(() =>
      sessionParameters(baseAttempt({ amount: 1, items: baseAttempt().items })),
    ).toThrow(/does not match/);
  });
  it("only redirects to Xendit checkout hosts", () => {
    expect(
      checkedXenditUrl("https://checkout.xendit.co/sessions/ps-x"),
    ).toContain("checkout.xendit.co");
    expect(() =>
      checkedXenditUrl("https://checkout.xendit.co.evil.example/x"),
    ).toThrow();
    expect(() => checkedXenditUrl("http://checkout.xendit.co/x")).toThrow();
  });
  it("compares webhook tokens exactly", () => {
    expect(verifyCallbackToken("a".repeat(32), "a".repeat(32))).toBe(true);
    expect(verifyCallbackToken("a".repeat(31), "a".repeat(32))).toBe(false);
    expect(verifyCallbackToken(null, "a".repeat(32))).toBe(false);
  });
});

describe("starting a Xendit payment", () => {
  beforeEach(() => vi.clearAllMocks());
  it("creates one session with the stored account context and binds it", async () => {
    const h = harness({
      attempts: [baseAttempt({ subAccountId: "sub_account_01" })],
    });
    h.fetch.mockResolvedValue(json(session(), 201));
    const result = await startXenditCheckout(
      orderId,
      userId,
      "GCASH",
      h.clients,
    );
    expect(result.url).toBe(
      "https://checkout-staging.xendit.co/sessions/ps-fixture0001",
    );
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("https://api.xendit.co/sessions");
    expect(init.headers["for-user-id"]).toBe("sub_account_01");
    expect(init.headers.Authorization).toBe(
      `Basic ${btoa("xnd_development_fixture:")}`,
    );
    expect(JSON.parse(init.body).allowed_payment_channels).toEqual(["GCASH"]);
    expect(h.rpc).toHaveBeenCalledWith(
      "bind_xendit_payment",
      expect.objectContaining({ p_session: "ps-fixture0001" }),
    );
  });
  it("reuses an open session on a repeated click instead of creating another", async () => {
    const h = harness({
      attempts: [
        baseAttempt({
          phase: "open",
          sessionId: "ps-fixture0001",
          url: "https://checkout-staging.xendit.co/sessions/ps-fixture0001",
        }),
      ],
    });
    await startXenditCheckout(orderId, userId, "GCASH", h.clients);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("refuses an invalid channel or another customer's order before preparing", async () => {
    let h = harness({ enabled: ["GCASH"] });
    await expect(
      startXenditCheckout(orderId, userId, "BPI_ONLINE_BANKING", h.clients),
    ).rejects.toBeInstanceOf(XenditChannelError);
    expect(h.rpc).not.toHaveBeenCalledWith(
      "prepare_xendit_payment",
      expect.anything(),
    );
    h = harness({ owner: "70000000-0000-4000-8000-00000000ffff" });
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toThrow(/unavailable/);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("rejects a provider response with a tampered amount or reference", async () => {
    let h = harness();
    h.fetch.mockResolvedValue(json(session({ amount: 1 }), 201));
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toThrow(/does not match/);
    h = harness();
    h.fetch.mockResolvedValue(
      json(session({ reference_id: "someone-else" }), 201),
    );
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toThrow(/does not match/);
    expect(h.rpc).not.toHaveBeenCalledWith(
      "bind_xendit_payment",
      expect.anything(),
    );
  });
  it("treats a timeout as uncertain and leaves the attempt for reconciliation", async () => {
    const h = harness();
    h.fetch.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toBeInstanceOf(XenditUncertainError);
    expect(h.rpc).not.toHaveBeenCalledWith(
      "bind_xendit_payment",
      expect.anything(),
    );
  });
  it("cancels the old session with Xendit before switching channel", async () => {
    const open = baseAttempt({
      phase: "open",
      sessionId: "ps-fixture0001",
      url: "https://checkout-staging.xendit.co/sessions/ps-fixture0001",
    });
    const next = baseAttempt({
      id: "70000000-0000-4000-8000-000000000009",
      attemptNo: 2,
      channel: "PAYMAYA",
    });
    const h = harness({ attempts: [open, next] });
    h.fetch
      .mockResolvedValueOnce(json(session({ status: "CANCELED" })))
      .mockResolvedValueOnce(
        json(
          session({
            reference_id: next.id,
            payment_session_id: "ps-fixture0002",
            payment_link_url:
              "https://checkout-staging.xendit.co/sessions/ps-fixture0002",
          }),
          201,
        ),
      );
    const result = await startXenditCheckout(
      orderId,
      userId,
      "PAYMAYA",
      h.clients,
    );
    expect(h.fetch.mock.calls[0][0]).toBe(
      "https://api.xendit.co/sessions/ps-fixture0001/cancel",
    );
    expect(h.rpc).toHaveBeenCalledWith("supersede_xendit_payment", {
      p_attempt: attemptId,
      p_session: "ps-fixture0001",
    });
    expect(result.url).toContain("ps-fixture0002");
  });
  it("reconciles instead of switching when the old session already completed", async () => {
    const open = baseAttempt({
      phase: "open",
      sessionId: "ps-fixture0001",
      url: "https://checkout-staging.xendit.co/sessions/ps-fixture0001",
    });
    const h = harness({ attempts: [open] });
    h.fetch
      .mockResolvedValueOnce(
        json({ error_code: "INVALID_SESSION_STATUS" }, 422),
      )
      .mockResolvedValueOnce(
        json(session({ status: "COMPLETED", payment_id: "py-fixture" })),
      );
    const result = await startXenditCheckout(
      orderId,
      userId,
      "PAYMAYA",
      h.clients,
    );
    expect(result.url).toBe(
      `https://riway.example.invalid/account/orders/${orderId}`,
    );
    expect(h.rpc).not.toHaveBeenCalledWith(
      "supersede_xendit_payment",
      expect.anything(),
    );
    expect(h.rpc).toHaveBeenCalledWith(
      "apply_xendit_payment_event",
      expect.objectContaining({
        p_status: "COMPLETED",
        p_payment: "py-fixture",
      }),
    );
  });
  it("closes the attempt when Xendit refuses the channel, so another can be chosen", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(
      json({ error_code: "CHANNEL_NOT_ACTIVATED", message: "x" }, 400),
    );
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toBeInstanceOf(XenditChannelError);
    expect(h.rpc).toHaveBeenCalledWith("reject_xendit_payment", {
      p_attempt: attemptId,
      p_code: "CHANNEL_NOT_ACTIVATED",
    });
  });
  it("keeps rate-limited or failed creation uncertain instead of closing it", async () => {
    for (const status of [429, 409, 503]) {
      const h = harness();
      h.fetch.mockResolvedValue(json({ error_code: "ANY" }, status));
      await expect(
        startXenditCheckout(orderId, userId, "GCASH", h.clients),
      ).rejects.toThrow();
      expect(h.rpc).not.toHaveBeenCalledWith(
        "reject_xendit_payment",
        expect.anything(),
      );
    }
  });
  it("never sends an expiry that has already passed", async () => {
    const h = harness({
      attempts: [
        baseAttempt({ expiresAt: new Date(Date.now() - 60000).toISOString() }),
      ],
    });
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toThrow(/closed/);
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("uses only fetch options that Cloudflare Workers support", async () => {
    // Workers throw on redirect: "error"; only "follow" and "manual" exist.
    const h = harness();
    h.fetch.mockResolvedValue(json(session(), 201));
    await startXenditCheckout(orderId, userId, "GCASH", h.clients);
    for (const [, init] of h.fetch.mock.calls)
      expect(["manual", "follow", undefined]).toContain(init.redirect);
    expect(h.fetch.mock.calls[0][1].redirect).toBe("manual");
  });
  it("treats an unexpected redirect from Xendit as uncertain, without binding", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://elsewhere.example/" },
      }),
    );
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toBeInstanceOf(XenditUncertainError);
    expect(h.rpc).not.toHaveBeenCalledWith(
      "bind_xendit_payment",
      expect.anything(),
    );
    expect(h.rpc).not.toHaveBeenCalledWith(
      "reject_xendit_payment",
      expect.anything(),
    );
  });
  it("sanitizes provider error codes before storing them", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(json({ error_code: "bad code'; drop" }, 400));
    await expect(
      startXenditCheckout(orderId, userId, "GCASH", h.clients),
    ).rejects.toBeInstanceOf(XenditChannelError);
    expect(h.rpc).toHaveBeenCalledWith("reject_xendit_payment", {
      p_attempt: attemptId,
      p_code: "UNKNOWN",
    });
  });
  it("does not open payment for a paid order", async () => {
    const h = harness({
      attempts: [baseAttempt({ phase: "paid", sessionId: "ps-fixture0001" })],
    });
    const result = await startXenditCheckout(
      orderId,
      userId,
      "GCASH",
      h.clients,
    );
    expect(result.state).toBe("paid");
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("reconciling a Xendit session", () => {
  it("applies canonical state read with the stored sub-account, not the payload", async () => {
    const h = harness({
      context: {
        id: attemptId,
        orderId,
        livemode: false,
        subAccountId: "sub_account_01",
        sessionId: "ps-fixture0001",
      },
    });
    h.fetch.mockResolvedValue(
      json(session({ status: "COMPLETED", payment_id: "py-fixture" })),
    );
    expect(
      await reconcileXenditAttempt(
        attemptId,
        "payment_session.completed:ps-fixture0001",
        h.clients,
      ),
    ).toBe("paid");
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("https://api.xendit.co/sessions/ps-fixture0001");
    expect(init.headers["for-user-id"]).toBe("sub_account_01");
    expect(h.rpc).toHaveBeenCalledWith(
      "apply_xendit_payment_event",
      expect.objectContaining({ p_amount: 123456, p_currency: "PHP" }),
    );
  });
  it("fails when the session belongs to a different account context", async () => {
    const h = harness({
      context: {
        id: attemptId,
        orderId,
        livemode: false,
        subAccountId: "sub_account_01",
        sessionId: "ps-fixture0001",
      },
    });
    h.fetch.mockResolvedValue(json({ error_code: "NOT_FOUND" }, 404));
    await expect(
      reconcileXenditAttempt(attemptId, "evt", h.clients),
    ).rejects.toThrow(/404/);
    expect(h.rpc).not.toHaveBeenCalledWith(
      "apply_xendit_payment_event",
      expect.anything(),
    );
  });
  it("ignores references that are not RIWAY attempts", async () => {
    const h = harness({ context: null });
    expect(await reconcileXenditAttempt(attemptId, "evt", h.clients)).toBe(
      "unknown",
    );
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("rejects a session whose reference points at another attempt", async () => {
    const h = harness();
    h.fetch.mockResolvedValue(
      json(
        session({
          reference_id: "70000000-0000-4000-8000-00000000aaaa",
          status: "COMPLETED",
          payment_id: "py-x",
        }),
      ),
    );
    await expect(
      reconcileXenditAttempt(attemptId, "evt", h.clients),
    ).rejects.toThrow(/reference/);
  });
});
