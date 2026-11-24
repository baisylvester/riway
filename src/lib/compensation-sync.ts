import { z } from "zod";

// Mirrors private.staff_compensation_sync(). Holds no customer data.
export const compensationSyncSchema = z.object({
  counts: z.object({
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    acknowledged: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  stalePending: z.number().int().nonnegative(),
  attention: z
    .array(
      z.object({
        id: z.uuid(),
        orderId: z.uuid(),
        market: z.enum(["PH", "SG", "MY"]),
        eventType: z.enum(["order_paid", "order_reversed"]),
        status: z.enum(["pending", "processing", "acknowledged", "failed"]),
        attempts: z.number().int().nonnegative(),
        lastErrorCode: z.string().nullable(),
        createdAt: z.string(),
        nextAttemptAt: z.string(),
      }),
    )
    .max(50),
});
export type CompensationSync = z.infer<typeof compensationSyncSchema>;

export const compensationEventLabels = {
  order_paid: "Paid order volume",
  order_reversed: "Refund/cancellation reversal",
} as const;
