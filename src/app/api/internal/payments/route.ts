import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { failure } from "@/lib/http";
import {
  paymentClients,
  reconcileStripeSession,
  startStripeCheckout,
} from "@/services/stripe-payments";
import {
  cancelXenditSession,
  logPaymentError,
  reconcileXenditAttempt,
  startXenditCheckout,
  xenditClients,
} from "@/services/xendit-payments";

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WORKER_SECRET;
  if (!secret || secret.length < 32)
    return failure("Payment worker is not configured.", 503);
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return failure("Unauthorized", 401);
  // Each configured gateway is reconciled independently; neither depends on
  // the other's credentials.
  let stripe: ReturnType<typeof paymentClients> | null = null,
    xendit: ReturnType<typeof xenditClients> | null = null;
  try {
    stripe = paymentClients();
  } catch {}
  try {
    xendit = xenditClients();
  } catch {}
  const database = stripe?.database ?? xendit?.database;
  if (!database) return failure("No payment gateway is configured.", 503);
  // An order can reserve stock/quota before its first payment attempt exists.
  // The cleanup excludes Stripe- and Xendit-backed reservations, whose release
  // still requires canonical provider reconciliation.
  let expired: number;
  try {
    const cleanup = await database.rpc("release_expired_reservations");
    if (
      cleanup.error ||
      !Number.isSafeInteger(cleanup.data) ||
      cleanup.data < 0
    )
      return failure("Reservation maintenance is unavailable.", 503);
    expired = cleanup.data;
  } catch {
    return failure("Reservation maintenance is unavailable.", 503);
  }
  let checked = 0,
    failed = 0,
    abandoned = 0;
  const minute = Math.floor(Date.now() / 60000);
  if (stripe) {
    const batch = await stripe.database.rpc("pending_stripe_checkouts", {
      p_live: stripe.config.livemode,
    });
    if (batch.error || !Array.isArray(batch.data))
      return failure("Payment queue is unavailable.", 503);
    for (const item of batch.data as Row[]) {
      try {
        if (item.session_id)
          await reconcileStripeSession(
            String(item.session_id),
            `poll-${item.attempt_id}-${minute}`,
            false,
            stripe,
          );
        else
          await startStripeCheckout(
            String(item.order_id),
            String(item.user_id),
            stripe,
          );
        checked++;
      } catch {
        failed++;
        await stripe.database.rpc("flag_stripe_reconciliation", {
          p_attempt: item.attempt_id,
        });
      }
    }
  }
  if (xendit) {
    const batch = await xendit.database.rpc("pending_xendit_payments", {
      p_live: xendit.config.livemode,
    });
    if (batch.error || !Array.isArray(batch.data))
      return failure("Payment queue is unavailable.", 503);
    for (const item of batch.data as Row[]) {
      try {
        if (item.session_id) {
          const outcome = await reconcileXenditAttempt(
            String(item.attempt_id),
            `poll-${item.attempt_id}-${minute}`,
            xendit,
          );
          // Another attempt already paid this order: close this one so the
          // customer cannot pay twice.
          if (item.order_paid === true && outcome === "open")
            await cancelXenditSession(
              String(item.session_id),
              (item.sub_account_id as string | null) ?? null,
              xendit,
            );
        } else
          // Uncertain creation: retry with the same attempt and reference.
          await startXenditCheckout(
            String(item.order_id),
            String(item.user_id),
            String(item.channel_code),
            xendit,
          );
        checked++;
      } catch (error) {
        logPaymentError("worker", error, String(item.attempt_id));
        failed++;
        await xendit.database.rpc("flag_xendit_reconciliation", {
          p_attempt: item.attempt_id,
        });
      }
    }
    const released = await xendit.database.rpc(
      "release_abandoned_xendit_orders",
    );
    if (released.error || !Number.isSafeInteger(released.data))
      return failure("Reservation maintenance is unavailable.", 503);
    abandoned = released.data;
  }
  return NextResponse.json(
    { expired, ...(xendit ? { abandoned } : {}), checked, failed },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
