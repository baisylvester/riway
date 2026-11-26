import { z } from "zod";
import { NextResponse } from "next/server";
import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import { startStripeCheckout } from "@/services/stripe-payments";
import {
  startXenditCheckout,
  XenditChannelError,
  logPaymentError,
} from "@/services/xendit-payments";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = z
    .object({
      orderId: z.uuid(),
      // Optional Xendit channel change; routing is never accepted here.
      channel: z
        .string()
        .regex(/^[A-Z0-9_]{2,40}$/)
        .optional(),
    })
    .safeParse(
      await limitedText(request, 1024)
        .then(JSON.parse)
        .catch(() => null),
    );
  if (!input.success) return failure("Invalid order reference.");
  const { client, user, contactVerified } = await session();
  if (!user) return failure("Please sign in.", 401);
  if (!contactVerified)
    return failure("Verify your email before resuming payment.", 403);
  const order = await client
    .from("orders")
    .select("id")
    .eq("id", input.data.orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (order.error || !order.data) return failure("Order unavailable.", 404);
  // The gateway is whichever already holds an attempt for this order.
  const xendit = await client.rpc("xendit_payment_status", {
    p_order: order.data.id,
  });
  const current = z
    .object({ channel: z.string().regex(/^[A-Z0-9_]{2,40}$/) })
    .safeParse(xendit.error ? null : xendit.data);
  // Renewal orders can exist before any payment attempt. A selected Xendit
  // channel can start the first attempt. The database prevents either gateway
  // from opening an attempt after the other has reserved the order.
  const channel =
    input.data.channel ?? (current.success ? current.data.channel : undefined);
  const usesXendit = !!channel;
  if (usesXendit ? !xenditReadiness().enabled : !stripeReadiness().enabled)
    return failure("Checkout is disabled.", 409);
  try {
    return NextResponse.json(
      usesXendit
        ? await startXenditCheckout(order.data.id, user.id, channel)
        : await startStripeCheckout(order.data.id, user.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof XenditChannelError) return failure(error.message, 409);
    logPaymentError("resume", error, order.data.id);
    return failure(
      "Checkout could not be resumed. Review this order or contact support before paying again.",
      503,
    );
  }
}
