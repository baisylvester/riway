import { checkoutSchema } from "@/lib/domain";
import { failure, sameOrigin } from "@/lib/http";
import { session } from "@/lib/data";
import {
  CHECKOUT_SESSION_MINUTES,
  CHECKOUT_TERMS_VERSION,
  checkoutSessionParams,
  serviceClient,
  siteUrl,
  stripeClient,
  stripeEnabled,
} from "@/services/stripe-payments";

const noStore = { headers: { "Cache-Control": "no-store" } };

// Only these database refusals are shown to shoppers; anything else stays generic.
const refusals: [string, string][] = [
  ["Online sales not approved", "Online sales are not yet open in this market."],
  ["Payment integration unavailable", "Online payments are not yet open in this market."],
  ["Verified sponsor attribution required", "Online ordering requires a verified RIWAY distributor introduction."],
  ["Insufficient stock", "One or more products do not have enough stock. Review your bag."],
  ["Product unavailable in selected market", "One or more products are unavailable in this market. Review your bag."],
  ["Duplicate products", "Each product can appear only once in your bag."],
  ["Idempotency key reused with different data", "This checkout was already changed. Please start again from your bag."],
  ["Approved pricing unavailable", "Approved pricing is not available for one or more products."],
];

function refusal(message: string | undefined) {
  const match = refusals.find(([text]) => message?.includes(text));
  return failure(
    match?.[1] ?? "Your order could not be created. Review your bag and try again.",
    409,
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = checkoutSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return failure("Check your bag, delivery details and terms acceptance.");
  const { client, user } = await session();
  if (!user) return failure("Please sign in before checkout.", 401);
  if (!stripeEnabled())
    return failure(
      "Online ordering is unavailable. RIWAY policy approval, product registration, approved pricing and payment integration are required.",
      409,
    );

  const { market, items, address, idempotencyKey } = input.data;
  // Prices, stock and eligibility are decided by the database transaction.
  const { data: orderId, error } = await client.rpc("create_order", {
    m: market,
    items,
    delivery: address,
    key: idempotencyKey,
    terms: CHECKOUT_TERMS_VERSION,
  });
  if (error || typeof orderId !== "string") return refusal(error?.message);

  const service = serviceClient();
  if (!service) return failure("Online payments are not configured.", 503);
  let stripe: ReturnType<typeof stripeClient>, site: string;
  try {
    stripe = stripeClient();
    site = siteUrl();
  } catch {
    return failure("Online payments are not configured.", 503);
  }

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("id,currency,status,payment_status,stripe_checkout_session_id")
    .eq("id", orderId)
    .single();
  if (orderError || !order)
    return failure("Your order could not be prepared. Please try again.", 503);
  if (order.status !== "awaiting_payment" || order.payment_status !== "pending")
    return failure("This order is no longer payable. Review your bag.", 409);

  try {
    if (order.stripe_checkout_session_id) {
      // Same idempotency key replayed: reuse the hosted session if still open.
      const existing = await stripe.checkout.sessions.retrieve(
        order.stripe_checkout_session_id,
      );
      if (existing.status === "open" && existing.url)
        return Response.json({ url: existing.url }, noStore);
      return failure("This checkout has expired. Review your bag to start again.", 409);
    }

    const { data: lines, error: linesError } = await service
      .from("order_items")
      .select("product_name,quantity,unit_minor")
      .eq("order_id", orderId);
    if (linesError || !lines?.length)
      return failure("Your order could not be prepared. Please try again.", 503);

    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_MINUTES * 60;
    const checkout = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        orderId,
        currency: order.currency,
        lines: lines.map((line) => ({
          name: line.product_name,
          quantity: line.quantity,
          unitMinor: line.unit_minor,
        })),
        siteUrl: site,
        expiresAt,
      }),
      { idempotencyKey: `checkout-session/${orderId}` },
    );
    if (!checkout.url)
      return failure("Your checkout could not be started. Please try again.", 503);

    const attached = await service.rpc("stripe_attach_session", {
      oid: orderId,
      sid: checkout.id,
      expires: new Date(expiresAt * 1000).toISOString(),
    });
    if (attached.error || attached.data !== true)
      return failure("Your checkout could not be started. Please try again.", 503);
    return Response.json({ url: checkout.url }, noStore);
  } catch {
    return failure("Payment provider is unavailable. No payment has been taken.", 503);
  }
}
