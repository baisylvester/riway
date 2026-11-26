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
  held: z.number().int().nonnegative().default(0),
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
        holdReason: z
          .enum([
            "original_volume_unacknowledged",
            "original_snapshot_mismatch",
            "sponsor_identity_missing",
            "payment_under_review",
            "membership_unconfirmed",
            "membership_snapshot_mismatch",
          ])
          .nullable()
          .optional(),
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

export const compensationHoldLabels = {
  original_volume_unacknowledged: "Awaiting acknowledgement of paid volume",
  original_snapshot_mismatch: "Reversal differs from acknowledged paid volume",
  sponsor_identity_missing: "Sponsor identity missing from the order snapshot",
  payment_under_review: "Payment is under review",
  membership_unconfirmed: "Membership requires RIWAY confirmation",
  membership_snapshot_mismatch:
    "Verified membership differs from the queued snapshot",
} as const;
