"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import {
  cancellationProblem,
  cancellationRequestSchema,
  orderCancellationSchema,
} from "@/lib/cancellation";

export type CancellationActionResult = { message: string; ok?: boolean };

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
};

// One action for customers and staff. The database decides whether the caller
// owns the order or holds market admin/operations access with verified MFA.
export async function cancelOrder(
  _: CancellationActionResult,
  form: FormData,
): Promise<CancellationActionResult> {
  const staff = form.get("staff") === "1";
  try {
    const current = await session();
    if (!current.user) return { message: "Sign in to cancel this order." };
    if (staff) {
      const access = await staffAccess();
      if (
        !access.user ||
        !access.allowed ||
        !access.mfa ||
        access.user.id !== current.user.id
      )
        return {
          message: "Staff access and authenticator verification are required.",
        };
    }
    const parsed = cancellationRequestSchema.safeParse({
      orderId: text(form, "orderId"),
      reason: text(form, "reason") ?? "",
      staff,
    });
    if (!parsed.success)
      return { message: parsed.error.issues[0]?.message ?? "Check the form." };
    if (form.get("confirmed") !== "on")
      return { message: "Confirm the cancellation before continuing." };
    const input = parsed.data;
    const { data, error } = await current.client.rpc("cancel_order", {
      p_order: input.orderId,
      p_reason: input.reason ?? null,
    });
    if (error)
      return { message: cancellationProblem(error.code, error.message, staff) };
    const result = orderCancellationSchema.safeParse(data);
    if (
      !result.success ||
      result.data.orderId !== input.orderId ||
      result.data.status !== "cancelled" ||
      !result.data.cancellation
    )
      return {
        message:
          "The cancellation could not be confirmed. Reload before trying again.",
      };
    for (const route of ["/account/orders", "/admin/orders", "/admin/reports"])
      revalidatePath(route);
    revalidatePath(`/account/orders/${input.orderId}`);
    return {
      ok: true,
      message: "Order cancelled. Its stock hold was released.",
    };
  } catch {
    return {
      message: "Order cancellation could not be reached. Please retry.",
    };
  }
}
