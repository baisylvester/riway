import { z } from "zod";

// Mirrors private.cancel_order. The database remains authoritative; these
// schemas reject obviously invalid input early and verify RPC responses.
export const cancellationReasonSchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .refine(
    (value) => value.length <= 500,
    "Reasons are limited to 500 characters.",
  )
  .refine(
    (value) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value),
    "Remove unsupported characters from the reason.",
  )
  .refine(
    (value) => value.length === 0 || value.length >= 5,
    "Reasons need at least 5 characters.",
  )
  .transform((value) => value || null);

export const cancellationRequestSchema = z
  .object({
    orderId: z.uuid(),
    reason: cancellationReasonSchema.nullable().optional(),
    staff: z.boolean(),
  })
  .refine((v) => !v.staff || !!v.reason, {
    message: "Enter the reason for cancelling this order.",
    path: ["reason"],
  });
export type CancellationRequest = z.infer<typeof cancellationRequestSchema>;

export const orderCancellationSchema = z.object({
  orderId: z.uuid(),
  status: z.string().min(1).max(40),
  paymentStatus: z.string().min(1).max(40),
  cancellable: z.boolean(),
  cancellation: z
    .object({
      cancelledBy: z.enum(["customer", "staff"]),
      reason: z.string().max(500).nullable(),
      createdAt: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
    })
    .nullable(),
});
export type OrderCancellation = z.infer<typeof orderCancellationSchema>;

// Fixed, non-sensitive refusals raised by private.cancel_order.
const knownRefusals = [
  "Only unpaid orders can be cancelled online",
  "A payment has started for this order",
  "A cancellation reason is required",
  "This order was already cancelled",
];

export function cancellationProblem(
  code: string | undefined,
  message: string | undefined,
  staff: boolean,
) {
  if (code === "42501")
    return staff
      ? "Market administrator or operations access with verified MFA is required."
      : "This order is not available to your account.";
  if (["PGRST202", "42883", "42P01"].includes(code ?? ""))
    return "Order cancellation is not available yet. Please contact support.";
  if (code === "23514") return "Check the reason format (5 to 500 characters).";
  for (const known of knownRefusals)
    if (message?.includes(known)) {
      if (known === "A payment has started for this order")
        return staff
          ? "A payment has started for this order. Reconcile it in Payments before cancelling."
          : "A payment has started for this order. If it isn't completed, the order closes automatically; otherwise contact support.";
      if (known === "Only unpaid orders can be cancelled online")
        return "Only unpaid orders can be cancelled online. Contact RIWAY support to cancel a paid order.";
      return `${known}.`;
    }
  return "The order could not be cancelled. Reload and check the order.";
}

export const cancellationActorLabels: Record<string, string> = {
  customer: "You cancelled this order",
  staff: "Cancelled by RIWAY",
};
