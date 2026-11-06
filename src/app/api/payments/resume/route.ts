import { z } from "zod";
import { NextResponse } from "next/server";
import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import { startStripeCheckout } from "@/services/stripe-payments";
import { stripeReadiness } from "@/lib/stripe-config";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = z.object({ orderId: z.uuid() }).safeParse(
    await limitedText(request, 1024)
      .then(JSON.parse)
      .catch(() => null),
  );
  if (!input.success) return failure("Invalid order reference.");
  const { client, user } = await session();
  if (!user) return failure("Please sign in.", 401);
  if (!stripeReadiness().enabled) return failure("Checkout is disabled.", 409);
  const order = await client
    .from("orders")
    .select("id")
    .eq("id", input.data.orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (order.error || !order.data) return failure("Order unavailable.", 404);
  try {
    return NextResponse.json(
      await startStripeCheckout(order.data.id, user.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure(
      "Checkout could not be resumed. Review this order or contact support before paying again.",
      503,
    );
  }
}
