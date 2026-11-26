import { z } from "zod";
export function refundMinor(value: unknown) {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value.trim()))
    return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
export const refundPolicySchema = z.object({
  id: z.uuid(),
  version: z.string(),
  terms: z.string(),
  allowPartial: z.boolean(),
});
export const returnContextSchema = z.object({
  orderId: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  currency: z.string(),
  totalMinor: z.number().int(),
  refundedMinor: z.number().int(),
  remainingMinor: z.number().int(),
  canApprove: z.boolean(),
  canReceive: z.boolean(),
  policy: refundPolicySchema.nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      netMinor: z.number().int(),
      remainingMinor: z.number().int(),
    }),
  ),
  cases: z.array(
    z.object({
      id: z.uuid(),
      kind: z.string(),
      reason: z.string(),
      status: z.string(),
      resolution: z.string().nullable(),
      revision: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      caseId: z.uuid(),
      amountMinor: z.number().int(),
      phase: z.string(),
      createdAt: z.string(),
      attention: z.string().nullable(),
    }),
  ),
  goods: z.array(
    z.object({
      productId: z.uuid(),
      name: z.string(),
      quantity: z.number().int(),
      received: z.number().int(),
    }),
  ),
});
export type ReturnContext = z.infer<typeof returnContextSchema>;
