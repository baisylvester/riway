import { failure } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import {
  paymentClients,
  verifyStripeEvent,
  reconcileStripeSession,
} from "@/services/stripe-payments";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  let clients;
  // Continue settling existing sessions even when new checkout is disabled.
  try {
    clients = paymentClients();
  } catch {
    return failure("Stripe webhook is not configured.", 503);
  }
  let event;
  try {
    event = await verifyStripeEvent(
      await limitedText(request, 262144),
      request.headers.get("stripe-signature") ?? "",
      clients,
    );
  } catch {
    return failure("Invalid Stripe signature or event.", 400);
  }
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  )
    return NextResponse.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const object = event.data.object as { id: string };
    await reconcileStripeSession(
      object.id,
      event.id,
      event.type === "checkout.session.async_payment_failed",
      clients,
    );
    return NextResponse.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Retryable non-2xx: never acknowledge a payment before its DB transaction.
    return failure("Payment event could not be reconciled.", 503);
  }
}
