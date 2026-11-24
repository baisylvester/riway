import { z } from "zod";

// Mirrors private.my_inventory_alert_subscriptions / set_inventory_alert_subscription.
export const inventoryAlertSubscriptionsSchema = z
  .array(
    z.object({ market: z.enum(["PH", "SG", "MY"]), subscribed: z.boolean() }),
  )
  .min(1)
  .max(3);
export type InventoryAlertSubscriptions = z.infer<
  typeof inventoryAlertSubscriptionsSchema
>;

export const inventoryAlertRequestSchema = z.object({
  market: z.enum(["PH", "SG", "MY"]),
  enabled: z.enum(["on", "off"]).transform((v) => v === "on"),
});
