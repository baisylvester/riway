import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { failure } from "@/lib/http";
import {
  paymentClients,
  reconcileStripeSession,
  startStripeCheckout,
} from "@/services/stripe-payments";

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return failure("Payment worker is not configured.", 503);
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return failure("Unauthorized", 401);
  let clients;
  try {
    clients = paymentClients();
  } catch {
    return failure("Stripe is not configured.", 503);
  }
  const batch = await clients.database.rpc("pending_stripe_checkouts", {
    p_live: clients.config.livemode,
  });
  if (batch.error || !Array.isArray(batch.data))
    return failure("Payment queue is unavailable.", 503);
  let checked = 0,
    failed = 0;
  for (const item of batch.data) {
    try {
      if (item.session_id)
        await reconcileStripeSession(
          item.session_id,
          `poll-${item.attempt_id}-${Math.floor(Date.now() / 60000)}`,
          false,
          clients,
        );
      else await startStripeCheckout(item.order_id, item.user_id, clients);
      checked++;
    } catch {
      failed++;
      await clients.database.rpc("flag_stripe_reconciliation", {
        p_attempt: item.attempt_id,
      });
    }
  }
  return NextResponse.json(
    { checked, failed },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
