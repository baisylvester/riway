import { NextResponse } from "next/server";
import { z } from "zod";
import { failure } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import {
  parseSessionWebhook,
  reconcileXenditAttempt,
  verifyCallbackToken,
  xenditClients,
} from "@/services/xendit-payments";

const ok = (body: Record<string, unknown> = { received: true }) =>
  NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });

// Payment Sessions webhooks: payment_session.completed / payment_session.expired
// (https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session).
// Authenticated with the dashboard verification token in x-callback-token
// (https://docs.xendit.co/docs/handling-webhooks). The payload only says which
// session changed; its status, amount and account are re-read from Xendit.
export async function POST(request: Request) {
  let clients;
  // Settle existing sessions even while new checkout is disabled.
  try {
    clients = xenditClients();
  } catch {
    return failure("Xendit webhook is not configured.", 503);
  }
  if (
    !verifyCallbackToken(
      request.headers.get("x-callback-token"),
      clients.config.webhookToken,
    )
  )
    return failure("Invalid webhook token.", 401);
  let event;
  try {
    event = parseSessionWebhook(await limitedText(request, 262144));
  } catch {
    return failure("Invalid webhook payload.", 400);
  }
  if (
    !["payment_session.completed", "payment_session.expired"].includes(
      event.event,
    )
  )
    return ok();
  const attempt = z.uuid().safeParse(event.data.reference_id);
  // Not a RIWAY attempt (e.g. another integration on the same account).
  if (!attempt.success) return ok({ received: true, ignored: true });
  try {
    const outcome = await reconcileXenditAttempt(
      attempt.data,
      `${event.event}:${event.data.payment_session_id}`,
      clients,
      event.data.payment_session_id,
    );
    return ok({ received: true, ignored: outcome === "unknown" || undefined });
  } catch {
    // Non-2xx makes Xendit retry; never acknowledge before the DB transaction.
    return failure("Payment event could not be reconciled.", 503);
  }
}
