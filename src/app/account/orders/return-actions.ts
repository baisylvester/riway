"use server";
import { z } from "zod";
import { revalidatePath } from "@/lib/revalidation";
import { session } from "@/lib/data";
type Result = { message: string; ok?: boolean };
export async function requestReturn(_: Result, f: FormData): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Sign in required." };
  const p = z
    .object({
      orderId: z.uuid(),
      kind: z.enum(["return", "refund", "paid_cancellation"]),
      reason: z.string().trim().min(5).max(1000),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return {
      message: "Choose a request type, explain the reason and confirm.",
    };
  const r = await client.rpc("request_order_return", {
    p_order: p.data.orderId,
    p_kind: p.data.kind,
    p_reason: p.data.reason,
  });
  if (r.error)
    return {
      message:
        "This request could not be recorded. Check the order and any open case, or contact support.",
    };
  revalidatePath(`/account/orders/${p.data.orderId}`);
  revalidatePath("/admin/returns");
  return {
    ok: true,
    message:
      "Request recorded for review. This does not itself cancel or refund the order.",
  };
}
