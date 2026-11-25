import { z } from "zod";
export const checkoutFulfilmentSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("delivery") }).strict(),
  z.object({ method: z.literal("collection"), centreId: z.uuid() }).strict(),
]);
export type CheckoutFulfilment = z.infer<typeof checkoutFulfilmentSchema>;
export const fulfilmentSnapshotSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("delivery") }),
  z.object({
    method: z.literal("collection"),
    centreId: z.uuid(),
    name: z.string(),
    line1: z.string(),
    city: z.string(),
    postalCode: z.string(),
    instructions: z.string(),
    revision: z.number().int(),
    additionalFeeMinor: z.literal(0),
  }),
]);
export const centreSchema = z.object({
  id: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  name: z.string(),
  line1: z.string(),
  city: z.string(),
  postal_code: z.string(),
  instructions: z.string(),
  active: z.boolean(),
  revision: z.number().int(),
});
export type ServiceCentre = z.infer<typeof centreSchema>;
