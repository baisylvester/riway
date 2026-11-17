import { z } from "zod";

// Mirrors private.advance_order_fulfilment. The database remains authoritative;
// these schemas reject obviously invalid input early and verify RPC responses.
export const fulfilmentSteps = ["fulfilling", "shipped", "delivered"] as const;
export type FulfilmentStep = (typeof fulfilmentSteps)[number];

export const nextFulfilmentStep: Partial<Record<string, FulfilmentStep>> = {
  paid: "fulfilling",
  fulfilling: "shipped",
  shipped: "delivered",
};

export const orderStatusLabels: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid, preparing your order",
  fulfilling: "Being packed",
  shipped: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const fulfilmentStepLabels: Record<FulfilmentStep, string> = {
  fulfilling: "Packing started",
  shipped: "Dispatched",
  delivered: "Delivered",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Invalid text")
    .transform((value) => value || null)
    .nullable()
    .optional();

// Notes may span lines (for example collection details). Browser line breaks
// are normalised to \n; every other control character is refused, as in SQL.
const optionalNote = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .refine((value) => value.length <= 500, "Notes are limited to 500 characters.")
  .refine(
    (value) => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value),
    "Remove unsupported characters from the note.",
  )
  .transform((value) => value || null)
  .nullable()
  .optional();

const trackingNumber = /^[A-Za-z0-9][A-Za-z0-9 -]{2,62}[A-Za-z0-9]$/;

export const fulfilmentRequestSchema = z
  .object({
    orderId: z.uuid(),
    status: z.enum(fulfilmentSteps),
    method: z.enum(["courier", "collection"]).nullable().optional(),
    carrier: optionalText(80),
    trackingNumber: optionalText(64),
    trackingUrl: optionalText(500),
    note: optionalNote,
  })
  .superRefine((v, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (v.status === "shipped") {
      if (!v.method) fail("Choose courier delivery or service-centre collection.");
      if (v.method === "courier") {
        if (!v.carrier || v.carrier.length < 2) fail("Enter the carrier.");
        if (!v.trackingNumber || !trackingNumber.test(v.trackingNumber))
          fail("Enter a valid tracking number.");
        if (v.trackingUrl && !/^https:\/\/\S+$/.test(v.trackingUrl))
          fail("Tracking links must start with https://.");
      }
      if (v.method === "collection") {
        if (!v.note) fail("Enter the service-centre collection details.");
        if (v.carrier || v.trackingNumber || v.trackingUrl)
          fail("Collection does not use carrier details.");
      }
    } else if (v.method || v.carrier || v.trackingNumber || v.trackingUrl) {
      fail("Carrier details belong to the dispatch step.");
    }
  });
export type FulfilmentRequest = z.infer<typeof fulfilmentRequestSchema>;

const timestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)));

export const fulfilmentEventSchema = z.object({
  fromStatus: z.enum(["paid", "fulfilling", "shipped"]),
  toStatus: z.enum(fulfilmentSteps),
  method: z.enum(["courier", "collection"]).nullable(),
  carrier: z.string().max(80).nullable(),
  trackingNumber: z.string().max(64).nullable(),
  trackingUrl: z
    .string()
    .max(500)
    .regex(/^https:\/\/\S+$/)
    .nullable(),
  note: z.string().max(500).nullable(),
  createdAt: timestamp,
});
export type FulfilmentEvent = z.infer<typeof fulfilmentEventSchema>;

export const orderFulfilmentSchema = z.object({
  orderId: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  status: z.string().min(1).max(40),
  paymentStatus: z.string().min(1).max(40),
  events: z.array(fulfilmentEventSchema).max(3),
});
export type OrderFulfilment = z.infer<typeof orderFulfilmentSchema>;
