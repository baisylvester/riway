import { z } from "zod";
import { membershipQualificationSchema } from "./membership";
import { bonusItemsSchema } from "./bonus-campaigns";
import {
  checkoutFulfilmentSchema,
  fulfilmentSnapshotSchema,
  type CheckoutFulfilment,
} from "./checkout-fulfilment";
import {
  cartSchema,
  marketSchema,
  markets,
  type CartItem,
  type Market,
} from "./domain";

export const promotionCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,40}$/);
export const quoteRequestSchema = z.object({
  fulfilment: checkoutFulfilmentSchema.optional(),
  market: marketSchema,
  items: cartSchema
    .min(1)
    .refine(
      (items) =>
        new Set(items.map((item) => item.productId.toLowerCase())).size ===
        items.length,
    ),
  promotionCode: promotionCodeSchema.optional(),
});
const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const commerceQuoteSchema = z
  .object({
    fulfilment: fulfilmentSnapshotSchema.optional(),
    bonusItems: bonusItemsSchema.optional(),
    market: marketSchema,
    currency: z.enum(["PHP", "SGD", "MYR"]),
    items: z
      .array(
        z.object({
          productId: z.uuid(),
          name: z.string().min(1).max(120),
          quantity: z.number().int().min(1).max(24),
          unitMinor: minor.refine((value) => value > 0),
          grossMinor: minor,
          discountMinor: minor,
          netMinor: minor,
          packageOfferId: z.uuid().nullable(),
        }),
      )
      .min(1)
      .max(30),
    subtotalMinor: minor,
    discountMinor: minor,
    totalMinor: minor.refine((value) => value > 0),
    promotion: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(120),
        code: promotionCodeSchema,
      })
      .nullable(),
    membership: membershipQualificationSchema.nullable().optional(),
    quoteHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((quote, ctx) => {
    const invalid =
      quote.currency !== markets[quote.market].currency ||
      new Set(quote.items.map((item) => item.productId.toLowerCase())).size !==
        quote.items.length ||
      quote.items.some(
        (item) =>
          item.grossMinor !== item.quantity * item.unitMinor ||
          item.netMinor !== item.grossMinor - item.discountMinor ||
          item.discountMinor > item.grossMinor,
      ) ||
      quote.subtotalMinor !==
        quote.items.reduce((sum, item) => sum + item.grossMinor, 0) ||
      quote.discountMinor !==
        quote.items.reduce((sum, item) => sum + item.discountMinor, 0) ||
      quote.totalMinor !==
        quote.items.reduce((sum, item) => sum + item.netMinor, 0) ||
      quote.totalMinor !== quote.subtotalMinor - quote.discountMinor ||
      (quote.promotion === null && quote.discountMinor !== 0);
    const invalidMembership =
      quote.membership != null &&
      !quote.items.some(
        (item) =>
          item.productId === quote.membership!.productId &&
          item.packageOfferId === quote.membership!.packageOfferId &&
          item.quantity >= quote.membership!.minimumQuantity,
      );
    if (invalid || invalidMembership)
      ctx.addIssue({
        code: "custom",
        message: "The quote amounts could not be verified.",
      });
  });
export type CommerceQuote = z.infer<typeof commerceQuoteSchema>;
export const packageCompositionsSchema = z
  .array(
    z.object({
      productId: z.uuid(),
      offerId: z.uuid(),
      components: z
        .array(
          z.object({
            productId: z.uuid(),
            name: z.string().min(1).max(120),
            quantity: z.number().int().min(1).max(1000),
          }),
        )
        .min(1)
        .max(30),
    }),
  )
  .max(1000);
export function quoteSelection(
  market: Market,
  items: CartItem[],
  code: string,
  fulfilment?: CheckoutFulfilment,
) {
  return {
    market,
    items,
    promotionCode: code.trim().toUpperCase() || undefined,
    ...(fulfilment ? { fulfilment } : {}),
  };
}
export function quoteFingerprint(
  market: Market,
  items: CartItem[],
  code: string,
  fulfilment?: CheckoutFulfilment,
) {
  return JSON.stringify(quoteSelection(market, items, code, fulfilment));
}
