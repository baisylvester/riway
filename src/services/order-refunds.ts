import "server-only";
import { z } from "zod";
import type Stripe from "stripe";
import { paymentClients } from "./stripe-payments";
import { xenditClients, toMajor, toMinor } from "./xendit-payments";

export const refundJobSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  lease: z.uuid().nullable(),
  firstSubmission: z.boolean(),
  firstDispatchedAt: z.string().nullable(),
  gateway: z.enum(["stripe", "xendit"]),
  livemode: z.boolean(),
  paymentId: z.string().min(5).max(160),
  subAccountId: z.string().nullable(),
  providerRefundId: z.string().nullable(),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(["PHP", "SGD", "MYR"]),
});
export type RefundJob = z.infer<typeof refundJobSchema>;
type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export type RefundFacts = {
  id: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  phase: "pending" | "succeeded" | "failed" | "review";
};
const reference = (job: RefundJob) => `riway-refund:${job.id}`;
function verify(job: RefundJob, facts: RefundFacts) {
  if (
    facts.paymentId !== job.paymentId ||
    facts.amountMinor !== job.amountMinor ||
    facts.currency.toUpperCase() !== job.currency ||
    (job.providerRefundId && job.providerRefundId !== facts.id)
  )
    throw Error("Refund provider facts mismatch");
  return facts;
}
export async function reconcileRefundJob(
  job: RefundJob,
  rpc: Rpc,
  resolve: (job: RefundJob) => Promise<RefundFacts>,
) {
  const facts = verify(job, await resolve(job));
  const result = await rpc("apply_order_refund", {
    p_id: job.id,
    p_provider_id: facts.id,
    p_payment_id: facts.paymentId,
    p_amount: facts.amountMinor,
    p_currency: facts.currency,
    p_phase: facts.phase,
  });
  if (result.error) throw Error("Refund ledger unavailable");
  return result.data;
}
export async function deliverRefundBatch(
  rpc: Rpc,
  gateway: "stripe" | "xendit",
  livemode: boolean,
  resolve: (job: RefundJob) => Promise<RefundFacts>,
) {
  const result = await rpc("claim_order_refunds", {
    p_gateway: gateway,
    p_live: livemode,
    p_limit: 10,
  });
  const jobs = z.array(refundJobSchema).max(20).safeParse(result.data);
  if (result.error || !jobs.success) throw Error("Refund queue unavailable");
  let reconciled = 0,
    review = 0,
    persistenceFailures = 0;
  for (const job of jobs.data) {
    try {
      if (job.gateway !== gateway || job.livemode !== livemode)
        throw Error("Refund mode mismatch");
      await reconcileRefundJob(job, rpc, resolve);
      reconciled++;
    } catch {
      review++;
      const flagged = await rpc("flag_order_refund", {
        p_id: job.id,
        p_lease: job.lease,
      });
      if (flagged.error) persistenceFailures++;
    }
  }
  return { reconciled, review, persistenceFailures };
}
export function stripeRefundResolver(
  clients: ReturnType<typeof paymentClients>,
) {
  return async (job: RefundJob): Promise<RefundFacts> => {
    if (
      job.gateway !== "stripe" ||
      job.livemode !== clients.config.livemode ||
      job.subAccountId !== null ||
      !/^pi_[A-Za-z0-9_]+$/.test(job.paymentId)
    )
      throw Error("Refund routing mismatch");
    let refund: Stripe.Refund | null = null;
    if (job.providerRefundId) {
      if (!/^re_[A-Za-z0-9_]+$/.test(job.providerRefundId))
        throw Error("Invalid refund ID");
      refund = await clients.stripe.refunds.retrieve(job.providerRefundId);
    } else {
      // Search before retrying creation. Idempotency is reused only within a
      // bounded window; old/ambiguous outcomes never get a fresh request key.
      let starting_after: string | undefined;
      for (let page = 0; page < 10; page++) {
        const list = await clients.stripe.refunds.list({
          payment_intent: job.paymentId,
          limit: 100,
          ...(starting_after ? { starting_after } : {}),
        });
        refund =
          list.data.find((r) => r.metadata?.refund_request_id === job.id) ??
          null;
        if (refund || !list.has_more) break;
        starting_after = list.data.at(-1)?.id;
        if (!starting_after) throw Error("Refund pagination invalid");
      }
      if (!refund) {
        const since = job.firstDispatchedAt
          ? Date.parse(job.firstDispatchedAt)
          : NaN;
        if (
          !job.firstSubmission &&
          (!Number.isFinite(since) || Date.now() - since > 23 * 3600000)
        )
          throw Error("Old uncertain refund needs reconciliation");
        refund = await clients.stripe.refunds.create(
          {
            payment_intent: job.paymentId,
            amount: job.amountMinor,
            reason: "requested_by_customer",
            metadata: { refund_request_id: job.id, order_id: job.orderId },
          },
          { idempotencyKey: reference(job) },
        );
      }
    }
    if (
      refund.metadata?.refund_request_id !== job.id ||
      refund.metadata?.order_id !== job.orderId
    )
      throw Error("Refund metadata mismatch");
    const paymentId =
      typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent?.id;
    const phase =
      refund.status === "succeeded"
        ? "succeeded"
        : ["failed", "canceled"].includes(refund.status ?? "")
          ? "failed"
          : refund.status === "pending"
            ? "pending"
            : "review";
    return verify(job, {
      id: refund.id,
      paymentId: paymentId ?? "",
      amountMinor: refund.amount,
      currency: refund.currency,
      phase,
    });
  };
}
const xRefundSchema = z.object({
  refund_id: z.string().regex(/^rfd-[0-9a-f-]{36}$/),
  reference_id: z.string(),
  payment_id: z.string(),
  amount: z.number().positive(),
  currency: z.string(),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
});
export function xenditRefundResolver(
  clients: ReturnType<typeof xenditClients>,
) {
  return async (job: RefundJob): Promise<RefundFacts> => {
    if (
      job.gateway !== "xendit" ||
      job.livemode !== clients.config.livemode ||
      !/^([A-Za-z0-9_-]{5,160})$/.test(job.paymentId) ||
      (job.subAccountId && !/^[A-Za-z0-9_-]{8,64}$/.test(job.subAccountId))
    )
      throw Error("Refund routing mismatch");
    const headers: Record<string, string> = {
      Authorization: `Basic ${btoa(`${clients.config.key}:`)}`,
      "api-version": "2024-11-11",
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (job.subAccountId) headers["for-user-id"] = job.subAccountId;
    const request = async (
      method: "GET" | "POST",
      path: string,
      body?: unknown,
    ) => {
      const response = await clients.fetch(clients.config.apiBase + path, {
        method,
        headers,
        signal: AbortSignal.timeout(10000),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw Error("Refund provider unavailable");
      return response.json();
    };
    let data: unknown;
    if (job.providerRefundId) {
      if (!/^rfd-[0-9a-f-]{36}$/.test(job.providerRefundId))
        throw Error("Invalid refund ID");
      data = await request("GET", `/v3/refunds/${job.providerRefundId}`);
    } else if (job.firstSubmission) {
      // POST /v3/refunds does not document an idempotency header. Persisted
      // first-dispatch intent permits exactly one POST; uncertainty uses GET.
      data = await request("POST", "/v3/refunds", {
        reference_id: reference(job),
        payment_id: job.paymentId,
        amount: toMajor(job.amountMinor),
        reason: "REQUESTED_BY_CUSTOMER",
        metadata: { order_id: job.orderId, refund_request_id: job.id },
      });
    } else {
      if (!job.paymentId.startsWith("py-"))
        throw Error("Legacy refund outcome requires merchant reconciliation");
      const list = z
        .array(xRefundSchema)
        .max(1000)
        .parse(
          await request(
            "GET",
            `/v3/refunds?payment_id=${encodeURIComponent(job.paymentId)}`,
          ),
        );
      const matches = list.filter((r) => r.reference_id === reference(job));
      if (matches.length !== 1) throw Error("Refund outcome uncertain");
      data = matches[0];
    }
    const refund = xRefundSchema.parse(data);
    if (refund.reference_id !== reference(job))
      throw Error("Refund reference mismatch");
    return verify(job, {
      id: refund.refund_id,
      paymentId: refund.payment_id,
      amountMinor: toMinor(refund.amount),
      currency: refund.currency,
      phase:
        refund.status === "SUCCEEDED"
          ? "succeeded"
          : refund.status === "FAILED"
            ? "failed"
            : "pending",
    });
  };
}
