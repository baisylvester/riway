import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Stripe-hosted Checkout: card data and wallet details never reach riway.com.
// Amounts are always read from the order items the database priced; browser
// input contributes only product identifiers and quantities.
export const STRIPE_INTEGRATION_IDENTIFIER = "riway-hosted-checkout-qzvbnmxk";
export const CHECKOUT_TERMS_VERSION = "2026-11-draft";
// Stripe Checkout sessions must expire between 30 minutes and 24 hours out.
export const CHECKOUT_SESSION_MINUTES = 31;

export interface SettlementLine {
  name: string;
  quantity: number;
  unitMinor: number;
}

export function stripeEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.PAYMENT_PROVIDER === "stripe";
}

export function stripeClient(env: NodeJS.ProcessEnv = process.env): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  // Restricted keys (rk_) are preferred; they need only Checkout session write access.
  if (!key || !/^(rk|sk)_(test|live)_[A-Za-z0-9]{8,}$/.test(key))
    throw new Error("Stripe is not configured.");
  return new Stripe(key);
}

export function serviceClient(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function siteUrl(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  return url.replace(/\/$/, "");
}

export function checkoutSessionParams(input: {
  orderId: string;
  currency: string;
  lines: SettlementLine[];
  siteUrl: string;
  expiresAt: number;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    line_items: input.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: line.unitMinor,
        product_data: { name: line.name.slice(0, 250) },
      },
    })),
    client_reference_id: input.orderId,
    metadata: { order_id: input.orderId },
    payment_intent_data: { metadata: { order_id: input.orderId } },
    success_url: `${input.siteUrl}/checkout/return?order=${input.orderId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.siteUrl}/checkout?cancelled=1`,
    expires_at: input.expiresAt,
    integration_identifier: STRIPE_INTEGRATION_IDENTIFIER,
  } as Stripe.Checkout.SessionCreateParams;
}

export type Settlement =
  | { outcome: "paid" | "failed" | "expired"; session: Stripe.Checkout.Session }
  | { outcome: "ignored" };

// Fulfilment follows the event, never the browser return. Delayed payment
// methods complete while still unpaid, so "completed" settles only when paid.
export function settlementFor(event: Stripe.Event): Settlement {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return session.payment_status === "paid"
        ? { outcome: "paid", session }
        : { outcome: "ignored" };
    }
    case "checkout.session.async_payment_succeeded":
      return {
        outcome: "paid",
        session: event.data.object as Stripe.Checkout.Session,
      };
    case "checkout.session.async_payment_failed":
      return {
        outcome: "failed",
        session: event.data.object as Stripe.Checkout.Session,
      };
    case "checkout.session.expired":
      return {
        outcome: "expired",
        session: event.data.object as Stripe.Checkout.Session,
      };
    default:
      return { outcome: "ignored" };
  }
}

export function verifyWebhook(
  stripe: Stripe,
  body: string,
  signature: string,
  secret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(body, signature, secret);
}
