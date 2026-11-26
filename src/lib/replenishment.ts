import { z } from "zod";
import { marketSchema, addressSchema } from "@/lib/domain";
import { commerceQuoteSchema } from "@/lib/commerce-checkout";

export const replenishmentOption = z.object({
  orderId: z.uuid(),
  ruleId: z.uuid(),
  version: z.string(),
  terms: z.string(),
  product: z.string(),
  intervalDays: z.number().int().positive(),
  quantity: z.number().int().positive(),
  market: marketSchema,
});
export const replenishmentSchedules = z.array(
  z.object({
    id: z.uuid(),
    market: marketSchema,
    product: z.string(),
    state: z.enum(["active", "paused", "cancelled"]),
    revision: z.number().int().positive(),
    quantity: z.number().int().positive(),
    intervalDays: z.number().int().positive(),
    nextDueAt: z.string(),
    due: z.boolean(),
    withdrawn: z.boolean(),
    orderId: z.uuid().nullable(),
    orderStatus: z.string().nullable(),
    paymentStatus: z.string().nullable(),
  }),
);
export const replenishmentQuote = z.object({
  quote: commerceQuoteSchema,
  terms: z.string().min(3).max(128),
  address: addressSchema,
});
export const replenishmentRuleList = z.object({
  products: z.array(z.object({ id: z.uuid(), name: z.string() })),
  rules: z.array(
    z.object({
      id: z.uuid(),
      product: z.string(),
      intervalDays: z.number().int().positive(),
      version: z.string(),
      reference: z.string(),
    }),
  ),
});

export function replenishmentMessage(error: { code: string; message: string }) {
  if (error.code === "40001")
    return "The schedule, quote or terms changed. Reload and review again.";
  if (error.code === "42501")
    return "You do not have access to this schedule or market.";
  if (error.code === "23505")
    return "An active schedule or policy already exists for this product.";
  if (
    [
      "This order is not eligible for a schedule",
      "Resolve the open renewal order before skipping",
      "Resolve the open renewal order first",
      "The recorded sponsor must be reconciled before renewal",
      "The original order must remain paid and unrefunded",
      "Choose an approved single product for this market",
    ].includes(error.message)
  )
    return error.message + ".";
  return "This change could not be completed. Check current product availability, market approval and schedule status.";
}
