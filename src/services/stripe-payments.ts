import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { stripeConfiguration } from "@/lib/stripe-config";

export const stripeAttemptSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  livemode: z.boolean(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(["php", "sgd", "myr"]),
  origin: z.url().refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && u.origin === v;
  }),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(24),
        unitAmount: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(30),
  expiresAt: z.number().int(),
  sessionId: z.string().nullable(),
  url: z.string().nullable(),
  phase: z.enum([
    "preparing",
    "open",
    "processing",
    "paid",
    "expired",
    "failed",
    "review",
  ]),
});
export type StripeAttempt = z.infer<typeof stripeAttemptSchema>;

export function paymentClients() {
  const config = stripeConfiguration();
  const stripe = new Stripe(config.key, {
    apiVersion: "2026-10-28.endive",
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 10000,
    telemetry: false,
  });
  const database = createClient(config.databaseUrl, config.databaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { config, stripe, database };
}

export function checkoutParameters(
  attempt: StripeAttempt,
): Stripe.Checkout.SessionCreateParams {
  if (
    attempt.items.reduce((n, i) => n + i.quantity * i.unitAmount, 0) !==
    attempt.amount
  )
    throw new Error("Payment total does not match order.");
  return {
    mode: "payment",
    payment_method_options: { card: { request_three_d_secure: "automatic" } },
    client_reference_id: attempt.orderId,
    metadata: { order_id: attempt.orderId, checkout_id: attempt.id },
    payment_intent_data: {
      metadata: { order_id: attempt.orderId, checkout_id: attempt.id },
    },
    line_items: attempt.items.map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: attempt.currency,
        unit_amount: i.unitAmount,
        product_data: { name: i.name },
      },
    })),
    expires_at: attempt.expiresAt,
    success_url: `${attempt.origin}/account/orders/${attempt.orderId}?payment=return`,
    cancel_url: `${attempt.origin}/account/orders/${attempt.orderId}?payment=cancelled`,
  };
}

export function checkedCheckoutUrl(value: string | null) {
  if (!value) throw new Error("Stripe checkout is unavailable.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Invalid checkout destination.");
  return url.href;
}

export async function startStripeCheckout(
  orderId: string,
  userId: string,
  clients = paymentClients(),
) {
  const { config, database, stripe } = clients;
  const prepared = await database.rpc("prepare_stripe_checkout", {
    p_order: orderId,
    p_user: userId,
    p_live: config.livemode,
    p_origin: config.site,
  });
  if (prepared.error) throw new Error("Order cannot be prepared for payment.");
  const attempt = stripeAttemptSchema.parse(prepared.data);
  if (attempt.livemode !== config.livemode)
    throw new Error("Payment mode mismatch.");
  if (["paid", "processing", "review"].includes(attempt.phase))
    return {
      orderId,
      url: `${attempt.origin}/account/orders/${orderId}`,
      state: attempt.phase,
    };
  if (["expired", "failed"].includes(attempt.phase))
    throw new Error(
      "This checkout has closed. Review your orders before starting again.",
    );
  if (attempt.sessionId && attempt.url)
    return {
      orderId,
      url: checkedCheckoutUrl(attempt.url),
      state: attempt.phase,
    };
  if (!config.checkoutAllowed)
    throw new Error("New payment sessions are disabled.");
  // Fixed snapshot, expiry and idempotency key are reused after ambiguous network
  // failures. Never release inventory merely because a network call timed out.
  const session = await stripe.checkout.sessions.create(
    checkoutParameters(attempt),
    {
      idempotencyKey: `riway-checkout-${attempt.id}`,
    },
  );
  if (
    session.livemode !== attempt.livemode ||
    session.client_reference_id !== attempt.orderId ||
    session.metadata?.checkout_id !== attempt.id
  )
    throw new Error("Stripe session does not match order.");
  const url = checkedCheckoutUrl(session.url);
  const bound = await database.rpc("bind_stripe_checkout", {
    p_attempt: attempt.id,
    p_session: session.id,
    p_url: url,
  });
  if (bound.error)
    throw new Error("Payment session could not be recorded. Retry this order.");
  return { orderId, url, state: "open" };
}

export async function reconcileStripeSession(
  sessionId: string,
  eventId: string,
  failed = false,
  clients = paymentClients(),
) {
  const { stripe, database, config } = clients;
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId))
    throw new Error("Invalid session reference.");
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  const order = z.uuid().parse(s.metadata?.order_id);
  const attempt = z.uuid().parse(s.metadata?.checkout_id);
  if (
    s.mode !== "payment" ||
    s.livemode !== config.livemode ||
    s.client_reference_id !== order
  )
    throw new Error("Payment reference mismatch.");
  const intent =
    typeof s.payment_intent === "string"
      ? s.payment_intent
      : (s.payment_intent?.id ?? null);
  const result = await database.rpc("apply_stripe_checkout_event", {
    p_event: eventId,
    p_attempt: attempt,
    p_order: order,
    p_session: s.id,
    p_live: s.livemode,
    p_amount: s.amount_total,
    p_currency: s.currency,
    p_status: s.status,
    p_payment: s.payment_status,
    p_intent: intent,
    p_failed: failed,
  });
  if (result.error) throw new Error("Payment reconciliation required.");
  return result.data as string;
}

export async function verifyStripeEvent(
  body: string,
  signature: string,
  clients = paymentClients(),
) {
  const event = await clients.stripe.webhooks.constructEventAsync(
    body,
    signature,
    clients.config.webhookSecret,
    300,
    Stripe.createSubtleCryptoProvider(),
  );
  if (event.livemode !== clients.config.livemode)
    throw new Error("Webhook mode mismatch.");
  return event;
}
