import { failure } from "@/lib/http";
import {
  serviceClient,
  settlementFor,
  stripeClient,
  stripeEnabled,
  verifyWebhook,
} from "@/services/stripe-payments";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: Request) {
  if (!stripeEnabled())
    return failure(
      "No payment gateway has been configured. No event was accepted.",
      503,
    );
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return failure("Invalid webhook request.", 400);

  let stripe: ReturnType<typeof stripeClient>;
  try {
    stripe = stripeClient();
  } catch {
    return failure("Payment gateway is not configured.", 503);
  }

  // The raw body must be verified before any field is trusted.
  const body = await request.text();
  let event;
  try {
    event = await verifyWebhook(stripe, body, signature, secret);
  } catch {
    return failure("Invalid webhook signature.", 400);
  }

  const settlement = settlementFor(event);
  if (settlement.outcome === "ignored")
    return Response.json({ received: true, outcome: "ignored" }, noStore);

  const service = serviceClient();
  if (!service) return failure("Payment settlement is not configured.", 503);

  // Non-2xx makes Stripe retry, so database failures are never acknowledged.
  const { data, error } = await service.rpc("stripe_settle_event", {
    event_id: event.id,
    event_type: event.type,
    sid: settlement.session.id,
    outcome: settlement.outcome,
    amount_minor: settlement.session.amount_total ?? 0,
    currency: settlement.session.currency ?? "",
  });
  if (error) return failure("Payment settlement is temporarily unavailable.", 500);
  if (data === "amount_mismatch" || data === "needs_review")
    console.error(`Stripe event ${event.id} requires review: ${data}`);
  return Response.json({ received: true, outcome: data }, noStore);
}
