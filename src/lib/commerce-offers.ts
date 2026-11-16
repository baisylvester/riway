import { z } from "zod";
import { marketSchema, markets } from "./domain";
import {
  packageDefinitionSchema,
  promotionDefinitionSchema,
} from "./commerce-drafts";

const timestamp = z.iso.datetime({ offset: true }).max(40);
const reference = z.string().trim().min(5).max(200);
const fields = {
  id: z.uuid(),
  market: marketSchema,
  currency: z.enum(["PHP", "SGD", "MYR"]),
  name: z.string().min(2).max(120),
  draftId: z.uuid(),
  draftRevision: z.number().int().min(1).max(2147483647),
  approvalReference: reference,
  approvedBy: z.uuid(),
  approvedAt: timestamp,
  withdrawnAt: timestamp.nullable(),
  contractVersion: z.literal(1),
};

export const commerceOfferSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...fields,
        kind: z.literal("package"),
        productId: z.uuid(),
        definition: packageDefinitionSchema,
      })
      .strict(),
    z
      .object({
        ...fields,
        kind: z.literal("promotion"),
        productId: z.null(),
        definition: promotionDefinitionSchema,
      })
      .strict(),
  ])
  .superRefine((offer, context) => {
    if (offer.currency !== markets[offer.market].currency)
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Offer currency must match its market.",
      });
    if (offer.kind === "package" && offer.definition.retailMinor === null)
      context.addIssue({
        code: "custom",
        path: ["definition", "retailMinor"],
        message: "Approved packages need a retail price.",
      });
    if (offer.kind === "promotion" && offer.definition.voucherCode === null)
      context.addIssue({
        code: "custom",
        path: ["definition", "voucherCode"],
        message: "Approved promotions need a voucher code.",
      });
  });

export const commerceOfferListSchema = z
  .object({
    offers: z.array(commerceOfferSchema).max(50),
    markets: z
      .array(marketSchema)
      .max(3)
      .refine((values) => new Set(values).size === values.length),
    hasMore: z.boolean(),
    page: z.number().int().min(1).max(1000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.offers.some((offer) => !value.markets.includes(offer.market)))
      context.addIssue({
        code: "custom",
        path: ["offers"],
        message: "Offers must belong to an allowed market.",
      });
  });

export const commerceApprovalInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("package"),
      draftId: z.uuid(),
      market: marketSchema,
      revision: z.number().int().min(1).max(2147483647),
      productId: z.uuid(),
      reference,
      acknowledged: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal("promotion"),
      draftId: z.uuid(),
      market: marketSchema,
      revision: z.number().int().min(1).max(2147483647),
      productId: z.null(),
      reference,
      acknowledged: z.literal(true),
    })
    .strict(),
]);

export const commerceWithdrawalInputSchema = z
  .object({
    offerId: z.uuid(),
    kind: z.enum(["package", "promotion"]),
    market: marketSchema,
    reference,
    acknowledged: z.literal(true),
  })
  .strict();

export type CommerceOffer = z.infer<typeof commerceOfferSchema>;
