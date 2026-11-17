"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import {
  fulfilmentRequestSchema,
  orderFulfilmentSchema,
} from "@/lib/fulfilment";

export type FulfilmentActionResult = { message: string; ok?: boolean };

function problem(code: string | undefined, message: string | undefined) {
  if (code === "42501")
    return "Market administrator or operations access with verified MFA is required.";
  if (["PGRST202", "42883", "42P01"].includes(code ?? ""))
    return "Order fulfilment setup is pending. Please contact your administrator.";
  if (code === "40001")
    return "This order has moved on. Reload to see its current status.";
  if (code === "23514")
    return "Check the carrier, tracking number, tracking link and note format.";
  // Fixed, non-sensitive rule refusals raised by the fulfilment function.
  for (const known of [
    "Only paid orders can be fulfilled",
    "Choose courier delivery or service-centre collection",
    "Courier dispatch requires a carrier and tracking number",
    "Collection requires service-centre details only",
    "Carrier details belong to the dispatch step",
    "This fulfilment step was already recorded with different details",
  ])
    if (message?.includes(known)) return `${known}.`;
  return "The fulfilment update was rejected. Reload and check the order.";
}

async function writer() {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return null;
  const current = await session();
  if (!current.user || current.user.id !== access.user.id) return null;
  return current;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
};

export async function advanceOrderFulfilment(
  _: FulfilmentActionResult,
  form: FormData,
): Promise<FulfilmentActionResult> {
  try {
    const current = await writer();
    if (!current)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = fulfilmentRequestSchema.safeParse({
      orderId: text(form, "orderId"),
      status: text(form, "status"),
      method: text(form, "method") || null,
      carrier: text(form, "carrier"),
      trackingNumber: text(form, "trackingNumber"),
      trackingUrl: text(form, "trackingUrl"),
      note: text(form, "note"),
    });
    if (!parsed.success)
      return { message: parsed.error.issues[0]?.message ?? "Check the form." };
    if (form.get("confirmed") !== "on")
      return { message: "Confirm the update before saving it." };
    const input = parsed.data;
    const { data, error } = await current.client.rpc(
      "advance_order_fulfilment",
      {
        p_order: input.orderId,
        p_status: input.status,
        p_method: input.method ?? null,
        p_carrier: input.carrier ?? null,
        p_tracking_number: input.trackingNumber ?? null,
        p_tracking_url: input.trackingUrl ?? null,
        p_note: input.note ?? null,
      },
    );
    if (error) return { message: problem(error.code, error.message) };
    const result = orderFulfilmentSchema.safeParse(data);
    // A replay after the order has moved on is still a recorded step.
    if (
      !result.success ||
      result.data.orderId !== input.orderId ||
      !result.data.events.some((event) => event.toStatus === input.status)
    )
      return {
        message: "The update could not be confirmed. Reload before trying again.",
      };
    for (const route of ["/admin/orders", "/account/orders"])
      revalidatePath(route);
    revalidatePath(`/account/orders/${input.orderId}`);
    return { ok: true, message: "Order status updated." };
  } catch {
    return { message: "Order fulfilment could not be reached. Please retry." };
  }
}
