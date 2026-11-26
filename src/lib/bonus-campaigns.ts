import { z } from "zod";
export const bonusItemSchema = z.object({
  campaignId: z.uuid(),
  campaignName: z.string().min(3).max(120),
  productId: z.uuid(),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(24),
  qualifyingProductId: z.uuid(),
  returnTerms: z.string().min(20).max(2000),
});
export const bonusItemsSchema = z.array(bonusItemSchema).max(30);
export const bonusCampaignSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    qualifyingProductId: z.uuid(),
    minimumQuantity: z.number().int().min(1).max(24),
    bonusProductId: z.uuid(),
    bonusQuantity: z.number().int().min(1).max(24),
    maximumPerOrder: z.number().int().min(1).max(24),
    maximumUnits: z.number().int().min(1).max(10000000),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    allowVoucher: z.boolean(),
    returnTerms: z.string().trim().min(20).max(2000),
    capacityAfterRefund: z.literal("retain"),
  })
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "End must follow start.",
  );
