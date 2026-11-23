import { checkoutSchema } from "@/lib/domain";
import { failure, sameOrigin } from "@/lib/http";
import { session } from "@/lib/data";
import { limitedText } from "@/lib/request-body";
import {
  paymentClients,
  startStripeCheckout,
} from "@/services/stripe-payments";
import {
  startXenditCheckout,
  xenditClients,
  XenditChannelError,
  logPaymentError,
} from "@/services/xendit-payments";
import { NextResponse } from "next/server";
import { stripeReadiness } from "@/lib/stripe-config";
import { configuredGateways, xenditReadiness } from "@/lib/xendit-config";
import { completePendingReferral } from "@/lib/referral-continuity";
import { commerceFailureStatus } from "@/lib/commerce-errors";
import { catalogueChannel } from "@/lib/xendit-channels";
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
  const payment = input.data.payment ?? { gateway: "stripe" as const };
  if (!configuredGateways().has(payment.gateway))
    return failure(
      "Online ordering is unavailable. RIWAY policy approval, product registration, approved pricing and payment integration are required.",
      409,
    );
  // Resolve the gateway before any order is created.
  let start: (orderId: string) => Promise<unknown>;
  let terms: string;
  let xenditLive = false;
  try {
    if (payment.gateway === "xendit") {
      const clients = xenditClients();
      if (!xenditReadiness().enabled) throw new Error("Checkout is disabled.");
      terms = clients.config.terms;
      xenditLive = clients.config.livemode;
      start = (orderId) =>
        startXenditCheckout(orderId, user.id, payment.channel, clients);
    } else {
      const clients = paymentClients();
      if (!stripeReadiness().enabled) throw new Error("Checkout is disabled.");
      terms = clients.config.terms;
      start = (orderId) => startStripeCheckout(orderId, user.id, clients);
    }
  } catch {
    return failure(
      payment.gateway === "xendit"
        ? "Xendit checkout is awaiting configuration."
        : "Stripe checkout is awaiting configuration.",
      503,
    );
  }
  if (input.data.termsVersion !== terms)
    return failure(
      "Terms have changed. Refresh checkout and review them before continuing.",
      409,
    );
  // Refuse a payment method that is not offered in this market before an
  // order (and its stock hold) exists. Amount limits are checked once the
  // server has priced the order.
  if (payment.gateway === "xendit") {
    const enabled = await Promise.resolve(
      client.rpc("xendit_checkout_channels", {
        p_market: input.data.market,
        p_live: xenditLive,
      }),
    ).catch(() => ({ data: null, error: { code: "TRANSPORT" } }));
    if (enabled.error || !Array.isArray(enabled.data))
      return failure(
        "Payment methods could not be checked. Please retry.",
        503,
      );
    if (
      !catalogueChannel(input.data.market, payment.channel) ||
      !(enabled.data as string[]).includes(payment.channel)
    )
      return failure(
        "This payment method is not available for your market. Choose another payment method.",
        409,
      );
  }
  if (!input.data.quoteHash)
    return failure(
      "Review the current total before continuing to payment.",
      409,
    );
  try {
    const referral = await completePendingReferral(client);
    if (referral.state === "invalid") return failure(referral.message, 409);
  } catch {
    return failure(
      "Your saved distributor introduction could not be verified. Please retry before placing this order.",
      503,
    );
  }
  const order = await Promise.resolve(
    client.rpc("create_membership_commerce_order", {
      m: input.data.market,
      items: input.data.items,
      delivery: input.data.address,
      key: input.data.idempotencyKey,
      terms,
      promotion_code: input.data.promotionCode ?? null,
      quote_hash: input.data.quoteHash,
      membership_consent: input.data.membershipConsent ?? null,
    }),
  ).catch(() => ({ data: null, error: { code: "TRANSPORT" } }));
  if (order.error?.code === "40001")
    return failure(
      "Prices or offers have changed. Review the current total before continuing.",
      409,
    );
  if (order.error && commerceFailureStatus(order.error.code) === 409)
    return failure(
      "Ordering is unavailable. Check market approval, verified sponsor, current prices and stock.",
      409,
    );
  if (order.error || typeof order.data !== "string")
    return failure(
      "Your order could not be confirmed. Retry with the same bag or check your orders before starting again.",
      503,
    );
  try {
    return NextResponse.json(await start(order.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof XenditChannelError) return failure(error.message, 409);
    logPaymentError(`checkout:${payment.gateway}`, error, order.data);
    return failure(
      "Payment could not be opened. Retry with the same bag, or resume this order from your account. No payment is confirmed here.",
      503,
    );
  }
}
