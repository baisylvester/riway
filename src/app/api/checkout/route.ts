import { checkoutSchema } from "@/lib/domain";
import { failure, sameOrigin } from "@/lib/http";
import { session } from "@/lib/data";
import { limitedText } from "@/lib/request-body";
import {
  paymentClients,
  startStripeCheckout,
} from "@/services/stripe-payments";
import { NextResponse } from "next/server";
import { stripeReadiness } from "@/lib/stripe-config";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = checkoutSchema.safeParse(
    await limitedText(request, 16384)
      .then(JSON.parse)
      .catch(() => null),
  );
  if (!input.success)
    return failure("Check your bag, delivery details and terms acceptance.");
  const { user, client } = await session();
  if (!user) return failure("Please sign in before checkout.", 401);
  if (process.env.PAYMENT_PROVIDER !== "stripe")
    return failure(
      "Online ordering is unavailable. RIWAY policy approval, product registration, approved pricing and payment integration are required.",
      409,
    );
  let clients;
  try {
    clients = paymentClients();
    if (!stripeReadiness().enabled) throw new Error("Checkout is disabled.");
  } catch {
    return failure("Stripe checkout is awaiting configuration.", 503);
  }
  if (input.data.termsVersion !== clients.config.terms)
    return failure(
      "Terms have changed. Refresh checkout and review them before continuing.",
      409,
    );
  const order = await client.rpc("create_order", {
    m: input.data.market,
    items: input.data.items,
    delivery: input.data.address,
    key: input.data.idempotencyKey,
    terms: clients.config.terms,
  });
  if (order.error || typeof order.data !== "string")
    return failure(
      "Ordering is unavailable. Check market approval, verified sponsor, current prices and stock.",
      409,
    );
  try {
    return NextResponse.json(
      await startStripeCheckout(order.data, user.id, clients),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure(
      "Payment could not be opened. Retry with the same bag, or resume this order from your account. No payment is confirmed here.",
      503,
    );
  }
}
