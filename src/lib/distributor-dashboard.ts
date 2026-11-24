import { z } from "zod";

// Mirrors private.my_distributor_dashboard(). Customers are pseudonymous
// labels; no name, contact, address or account id is ever returned.
export const distributorDashboardSchema = z.object({
  code: z.string(),
  market: z.enum(["PH", "SG", "MY"]),
  orders: z
    .array(
      z.object({
        reference: z.string().regex(/^[0-9A-F-]{8}$/),
        placedAt: z.string(),
        market: z.enum(["PH", "SG", "MY"]),
        status: z.string(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        totalMinor: z.number().int(),
        customer: z.string().regex(/^Customer [0-9A-F]{6}$/),
        units: z.number().int().nonnegative(),
      }),
    )
    .max(100),
  customers: z
    .array(
      z.object({
        customer: z.string().regex(/^Customer [0-9A-F]{6}$/),
        firstOrderAt: z.string(),
        lastOrderAt: z.string(),
        paidOrders: z.number().int().positive(),
        expectedReorderOn: z.string().nullable(),
      }),
    )
    .max(200),
  materials: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        url: z.string(),
      }),
    )
    .max(200),
});
export type DistributorDashboard = z.infer<typeof distributorDashboardSchema>;

export const materialRequestSchema = z.object({
  id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  market: z
    .enum(["PH", "SG", "MY", "ALL"])
    .transform((m) => (m === "ALL" ? null : m)),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(
      /^(\/[A-Za-z0-9._~%-][A-Za-z0-9._~/%-]*|https:\/\/(static\.wixstatic\.com|www\.riway\.com|riway\.com)\/[A-Za-z0-9._~/%?=&-]*)$/,
    ),
  reference: z.string().trim().min(3).max(120),
  published: z.enum(["on", "off"]).transform((v) => v === "on"),
});

export const photoRequestSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{3,40}$/),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(
      /^(\/images\/[a-zA-Z0-9._-]+|https:\/\/static\.wixstatic\.com\/[A-Za-z0-9._~/%-]+)?$/,
    ),
  reference: z.string().trim().max(120),
});

export const cycleRequestSchema = z.object({
  productId: z.uuid(),
  days: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 7 && v <= 365)),
  reference: z.string().trim().max(120),
});
