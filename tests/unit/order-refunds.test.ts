import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  stripeRefundResolver,
  xenditRefundResolver,
  deliverRefundBatch,
  type RefundJob,
} from "@/services/order-refunds";
import { refundMinor } from "@/lib/order-returns";
import type { paymentClients } from "@/services/stripe-payments";
import type { xenditClients } from "@/services/xendit-payments";
const job: RefundJob = {
  id: "91000000-0000-4000-8000-000000000001",
  orderId: "91000000-0000-4000-8000-000000000002",
  lease: "91000000-0000-4000-8000-000000000003",
  firstSubmission: true,
  firstDispatchedAt: new Date().toISOString(),
  gateway: "xendit",
  livemode: false,
  paymentId: "py-91000000-0000-4000-8000-000000000004",
  subAccountId: "qa_sub_account",
  providerRefundId: null,
  amountMinor: 40,
  currency: "PHP",
};
const xData = {
  refund_id: "rfd-91000000-0000-4000-8000-000000000005",
  reference_id: `riway-refund:${job.id}`,
  payment_id: job.paymentId,
  amount: 0.4,
  currency: "PHP",
  status: "SUCCEEDED",
};
const xClients = (fetcher: unknown) =>
  ({
    config: {
      livemode: false,
      key: "xnd_development_disposable",
      apiBase: "https://api.xendit.co",
    },
    fetch: fetcher,
  }) as ReturnType<typeof xenditClients>;
const sData = {
  id: "re_qa",
  payment_intent: "pi_qa",
  amount: 40,
  currency: "php",
  status: "succeeded",
  metadata: { refund_request_id: job.id, order_id: job.orderId },
};
const sClients = (refunds: unknown) =>
  ({ config: { livemode: false }, stripe: { refunds } }) as ReturnType<
    typeof paymentClients
  >;
describe("refund provider boundaries", () => {
  it("uses the original Xendit account, payment ID, API version and decimal amount", async () => {
    const fetcher = vi.fn(async () => Response.json(xData));
    const facts = await xenditRefundResolver(xClients(fetcher))(job);
    expect(facts).toMatchObject({
      amountMinor: 40,
      phase: "succeeded",
      paymentId: job.paymentId,
    });
    const [url, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.xendit.co/v3/refunds");
    expect(options.headers).toMatchObject({
      "api-version": "2024-11-11",
      "for-user-id": "qa_sub_account",
    });
    expect(JSON.parse(String(options.body))).toMatchObject({
      payment_id: job.paymentId,
      amount: 0.4,
      reference_id: `riway-refund:${job.id}`,
    });
  });
  it("reconciles an uncertain Xendit submission with GET and never repeats POST", async () => {
    const fetcher = vi.fn(async () => Response.json([xData]));
    await xenditRefundResolver(xClients(fetcher))({
      ...job,
      firstSubmission: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].method,
    ).toBe("GET");
  });
  it("keeps an unknown legacy Xendit outcome for review without another network submission", async () => {
    const fetcher = vi.fn();
    await expect(
      xenditRefundResolver(xClients(fetcher))({
        ...job,
        firstSubmission: false,
        paymentId: "ewc_qa_legacy",
      }),
    ).rejects.toThrow("merchant reconciliation");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-payment or mismatched provider amounts before ledger settlement", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ...xData, amount: 0.41 }),
    );
    await expect(xenditRefundResolver(xClients(fetcher))(job)).rejects.toThrow(
      "facts mismatch",
    );
  });
  it("reuses a stable Stripe idempotency key and freezes the original payment intent", async () => {
    const create = vi.fn(async () => sData);
    const resolver = stripeRefundResolver(
      sClients({
        list: vi.fn(async () => ({ data: [], has_more: false })),
        create,
      }),
    );
    await resolver({
      ...job,
      gateway: "stripe",
      paymentId: "pi_qa",
      subAccountId: null,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_qa", amount: 40 }),
      { idempotencyKey: `riway-refund:${job.id}` },
    );
  });
  it("does not recreate an old uncertain Stripe refund after the idempotency window", async () => {
    const create = vi.fn();
    const resolver = stripeRefundResolver(
      sClients({
        list: vi.fn(async () => ({ data: [], has_more: false })),
        create,
      }),
    );
    await expect(
      resolver({
        ...job,
        gateway: "stripe",
        paymentId: "pi_qa",
        subAccountId: null,
        firstSubmission: false,
        firstDispatchedAt: new Date(Date.now() - 25 * 3600000).toISOString(),
      }),
    ).rejects.toThrow("Old uncertain refund");
    expect(create).not.toHaveBeenCalled();
  });
  it("retains uncertain funds and flags the exact lease instead of marking a refund failed", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "claim_order_refunds" ? [job] : null,
      error: null,
    }));
    const result = await deliverRefundBatch(rpc, "xendit", false, async () => {
      throw Error("timeout");
    });
    expect(result.review).toBe(1);
    expect(rpc).toHaveBeenCalledWith("flag_order_refund", {
      p_id: job.id,
      p_lease: job.lease,
    });
    expect(rpc.mock.calls.some((c) => c[0] === "apply_order_refund")).toBe(
      false,
    );
  });
});
it("parses currency amounts exactly and rejects fractional minor units, exponent and unsafe totals", () => {
  expect(refundMinor("100.01")).toBe(10001);
  expect(refundMinor("0.4")).toBe(40);
  expect(refundMinor("1.001")).toBeNull();
  expect(refundMinor("1e3")).toBeNull();
  expect(refundMinor("-1")).toBeNull();
  expect(refundMinor("9007199254740992")).toBeNull();
});
