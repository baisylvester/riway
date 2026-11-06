import { z } from "zod";
export const markets = {
  PH: { name: "Philippines", currency: "PHP" },
  SG: { name: "Singapore", currency: "SGD" },
  MY: { name: "Malaysia", currency: "MYR" },
} as const;
export type Market = keyof typeof markets;
export const marketSchema = z.enum(["PH", "SG", "MY"]);
export const eventDateSchema = z
  .string()
  .max(16)
  .refine((value) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const date = new Date(value + "Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value
    );
  }, "Enter a valid UTC date and time.");
export function asMarket(value: unknown): Market {
  const result = marketSchema.safeParse(value);
  return result.success ? result.data : "PH";
}
export const cartItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(24),
});
export const cartSchema = z.array(cartItemSchema).max(30);
export type CartItem = z.infer<typeof cartItemSchema>;
export const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(25),
  line1: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(3).max(15),
  country: marketSchema,
});
export const checkoutSchema = z
  .object({
    market: marketSchema,
    items: cartSchema.min(1),
    address: addressSchema,
    terms: z.literal(true),
    termsVersion: z.string().min(3).max(128).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((v) => v.market === v.address.country, {
    message: "Delivery country must match the selected market.",
  });
export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  subtitle: string;
  description: string;
  image_url: string | null;
  status: string;
}
export interface Offer {
  product_id: string;
  market: Market;
  retail_minor: number | null;
  member_minor: number | null;
  currency: string;
  regulatory_approved: boolean;
  approval_reference: string | null;
  max_quantity: number;
}
export function money(minor: number | null, currency: string) {
  return minor === null
    ? "Pricing to be confirmed"
    : new Intl.NumberFormat("en", { style: "currency", currency }).format(
        minor / 100,
      );
}
export function eligibility(
  offer: Offer | undefined,
  policyApproved: boolean,
  gatewayReady: boolean,
) {
  if (!policyApproved)
    return {
      allowed: false,
      reason: "Online ordering is awaiting RIWAY approval for this market.",
    };
  if (!offer?.regulatory_approved || !offer.approval_reference)
    return {
      allowed: false,
      reason: "Sales are unavailable until market registration is verified.",
    };
  if (offer.retail_minor === null)
    return { allowed: false, reason: "Approved pricing is not yet available." };
  if (!gatewayReady)
    return { allowed: false, reason: "Online payments are not yet available." };
  return { allowed: true, reason: "" };
}
export function mergeCart(
  items: CartItem[],
  productId: string,
  quantity = 1,
): CartItem[] {
  const parsed = cartItemSchema.parse({ productId, quantity });
  const current = items.find((i) => i.productId === productId);
  const updated = current
    ? items.map((i) =>
        i.productId === productId
          ? { ...i, quantity: Math.min(24, i.quantity + parsed.quantity) }
          : i,
      )
    : [...items, parsed];
  return cartSchema.parse(updated);
}
