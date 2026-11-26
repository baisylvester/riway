import { timingSafeEqual } from "node:crypto";
import { failure } from "@/lib/http";
import { paymentClients } from "@/services/stripe-payments";
import { xenditClients } from "@/services/xendit-payments";
import {
  deliverRefundBatch,
  stripeRefundResolver,
  xenditRefundResolver,
} from "@/services/order-refunds";
export async function POST(request: Request) {
  const secret = process.env.REFUND_WORKER_SECRET;
  if (process.env.REFUNDS_ENABLED !== "true" || !secret || secret.length < 32)
    return failure("Refund dispatch is not configured.", 503);
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return failure("Unauthorized", 401);
  const results: Record<string, unknown> = {};
  let stripe: ReturnType<typeof paymentClients> | null = null,
    xendit: ReturnType<typeof xenditClients> | null = null;
  try {
    stripe = paymentClients();
  } catch {}
  try {
    xendit = xenditClients();
  } catch {}
  if (!stripe && !xendit)
    return failure("No refund gateway is configured.", 503);
  if (
    (stripe?.config.livemode || xendit?.config.livemode) &&
    process.env.REFUNDS_LIVE_APPROVED !== "true"
  )
    return failure("Live refund dispatch is not approved.", 503);
  try {
    if (stripe)
      results.stripe = await deliverRefundBatch(
        (n, a) => stripe!.database.rpc(n, a),
        "stripe",
        stripe.config.livemode,
        stripeRefundResolver(stripe),
      );
    if (xendit)
      results.xendit = await deliverRefundBatch(
        (n, a) => xendit!.database.rpc(n, a),
        "xendit",
        xendit.config.livemode,
        xenditRefundResolver(xendit),
      );
    if (
      Object.values(results).some(
        (result) =>
          (result as { persistenceFailures: number }).persistenceFailures > 0,
      )
    )
      return failure("Refund reconciliation could not be persisted.", 503);
    return Response.json(results, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return failure("Refund reconciliation is unavailable.", 503);
  }
}
