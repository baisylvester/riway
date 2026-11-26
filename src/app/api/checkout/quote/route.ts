import { session } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import { commerceFailureStatus } from "@/lib/commerce-errors";
import {
  commerceQuoteSchema,
  quoteRequestSchema,
} from "@/lib/commerce-checkout";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const input = quoteRequestSchema.safeParse(
    await limitedText(request, 16384)
      .then(JSON.parse)
      .catch(() => null),
  );
  if (!input.success)
    return failure("Check your bag, market and promotion code.");
  const { user, client } = await session();
  if (!user) return failure("Please sign in to review current prices.", 401);
  const { data, error } = await Promise.resolve(
    client.rpc(
      input.data.fulfilment
        ? "quote_fulfilment_checkout"
        : "quote_commerce_checkout",
      {
        m: input.data.market,
        items: input.data.items,
        promotion_code: input.data.promotionCode ?? null,
        ...(input.data.fulfilment ? { selection: input.data.fulfilment } : {}),
      },
    ),
  ).catch(() => ({ data: null, error: { code: "TRANSPORT" } }));
  if (error) {
    // A fixed, non-sensitive rule refusal: tell the shopper what to change.
    if (
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes(
        "Choose one qualifying membership package per order",
      )
    )
      return failure(
        "Choose one qualifying membership package per order. Remove the other package to continue.",
        409,
      );
    if (["PGRST202", "42883", "42P01"].includes(error.code))
      return failure("Order review is awaiting configuration.", 503);
    if (commerceFailureStatus(error.code) === 503)
      return failure(
        "Order review could not be reached. Please try again.",
        503,
      );
    return failure(
      "Order review is unavailable. Check market approval, current prices, stock and voucher eligibility.",
      409,
    );
  }
  const quote = commerceQuoteSchema.safeParse(data);
  if (
    !quote.success ||
    quote.data.market !== input.data.market ||
    (quote.data.promotion?.code ?? null) !==
      (input.data.promotionCode ?? null) ||
    quote.data.items.length !== input.data.items.length ||
    quote.data.items.some(
      (item) =>
        !input.data.items.some(
          (selection) =>
            selection.productId.toLowerCase() ===
              item.productId.toLowerCase() &&
            selection.quantity === item.quantity,
        ),
    )
  )
    return failure(
      "The order review could not be verified. Please try again.",
      503,
    );
  return Response.json(quote.data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
