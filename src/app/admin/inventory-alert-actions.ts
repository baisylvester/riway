"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import {
  inventoryAlertRequestSchema,
  inventoryAlertSubscriptionsSchema,
} from "@/lib/inventory-alerts";

export type InventoryAlertResult = { message: string; ok?: boolean };

// Staff opt themselves in; the database rechecks market role and MFA.
export async function saveInventoryAlertSubscription(
  _: InventoryAlertResult,
  form: FormData,
): Promise<InventoryAlertResult> {
  try {
    const access = await staffAccess();
    if (!access.user || !access.allowed || !access.mfa)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = inventoryAlertRequestSchema.safeParse({
      market: form.get("market"),
      enabled: form.get("enabled"),
    });
    if (!parsed.success) return { message: "Choose a market and setting." };
    const { client } = await session();
    const { data, error } = await client.rpc(
      "set_inventory_alert_subscription",
      { p_market: parsed.data.market, p_enabled: parsed.data.enabled },
    );
    if (error)
      return {
        message:
          error.code === "42501"
            ? "Market administrator or operations access with verified MFA is required."
            : ["PGRST202", "42883", "42P01"].includes(error.code ?? "")
              ? "Low-stock alerts are not available yet."
              : "The setting could not be saved. Reload and try again.",
      };
    const result = inventoryAlertSubscriptionsSchema.safeParse(data);
    const saved = result.success
      ? result.data.find((s) => s.market === parsed.data.market)
      : undefined;
    if (!saved || saved.subscribed !== parsed.data.enabled)
      return {
        message: "The setting could not be confirmed. Reload the page.",
      };
    revalidatePath("/admin");
    return {
      ok: true,
      message: `${parsed.data.market} daily low-stock alert ${parsed.data.enabled ? "on" : "off"}.`,
    };
  } catch {
    return { message: "Low-stock alerts could not be reached. Please retry." };
  }
}
