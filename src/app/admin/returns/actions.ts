"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import { returnContextSchema, refundMinor } from "@/lib/order-returns";
type Result = { message: string; ok?: boolean };
async function staffRpc(
  name: string,
  args: Record<string, unknown>,
  message: string,
): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const { client } = await session();
  const r = await client.rpc(name, args);
  if (r.error)
    return {
      message:
        r.error.code === "40001"
          ? "The case, allocation or financial state changed. Reload before retrying."
          : "Action denied. Check your market/role, current policy, references and amounts.",
    };
  revalidatePath("/admin/returns");
  revalidatePath("/account/orders/[id]", "page");
  return { ok: true, message };
}
export async function approvePolicy(_: Result, f: FormData): Promise<Result> {
  const p = z
    .object({
      market: z.enum(["PH", "SG", "MY"]),
      version: z.string().trim().min(3).max(120),
      terms: z.string().trim().min(20).max(8000),
      reference: z.string().trim().min(5).max(200),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return {
      message: "Complete the approved policy and confirm its exact rules.",
    };
  return staffRpc(
    "approve_refund_policy",
    {
      p_market: p.data.market,
      p_version: p.data.version,
      p_terms: p.data.terms,
      p_partial: f.get("partial") === "on",
      p_reference: p.data.reference,
    },
    "Refund policy approved for future quotes. Merchant capabilities still require verification.",
  );
}
export async function withdrawPolicy(_: Result, f: FormData): Promise<Result> {
  const id = z.uuid().safeParse(f.get("id"));
  if (!id.success || f.get("confirmed") !== "on")
    return { message: "Confirm policy withdrawal." };
  return staffRpc(
    "withdraw_refund_policy",
    { p_id: id.data },
    "Policy withdrawn from future quotes. Existing order terms and approved refunds are retained.",
  );
}
export async function approveRefund(_: Result, f: FormData): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const p = z
    .object({
      orderId: z.uuid(),
      caseId: z.uuid(),
      policyId: z.uuid(),
      reference: z.string().trim().min(5).max(200),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return { message: "Review policy, amounts, reference and confirmation." };
  const { client } = await session();
  const result = returnContextSchema.safeParse(
    (await client.rpc("return_context", { p_order: p.data.orderId })).data,
  );
  if (
    !result.success ||
    !result.data.canApprove ||
    !result.data.cases.some((c) => c.id === p.data.caseId)
  )
    return { message: "Refund approval access denied." };
  const amounts = result.data.items.map((item) => ({
    itemId: item.id,
    amountMinor: refundMinor(f.get(`amount_${item.id}`) ?? "0"),
  }));
  if (amounts.some((a) => a.amountMinor === null))
    return { message: "Use currency amounts with at most two decimal places." };
  const allocations = amounts.filter(
    (a): a is { itemId: string; amountMinor: number } =>
      a.amountMinor !== null && a.amountMinor > 0,
  );
  if (!allocations.length)
    return {
      message: "Enter a positive refund amount for at least one line.",
    };
  return staffRpc(
    "approve_order_refund",
    {
      p_case: p.data.caseId,
      p_policy: p.data.policyId,
      p_allocations: allocations,
      p_reference: p.data.reference,
    },
    "Refund approved and reserved in the ledger. Completion requires verified provider reconciliation.",
  );
}
export async function receiveReturnedStock(
  _: Result,
  f: FormData,
): Promise<Result> {
  const p = z
    .object({
      caseId: z.uuid(),
      productId: z.uuid(),
      quantity: z.coerce.number().int().min(1).max(100000),
      disposition: z.enum(["restock", "quarantine", "discard"]),
      reference: z.string().trim().min(5).max(200),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return {
      message: "Review actual goods received, disposition and reference.",
    };
  return staffRpc(
    "record_return_stock",
    {
      p_case: p.data.caseId,
      p_product: p.data.productId,
      p_quantity: p.data.quantity,
      p_disposition: p.data.disposition,
      p_reference: p.data.reference,
    },
    "Returned-goods receipt recorded. Only restocked goods increase sellable inventory.",
  );
}
export async function resolveCase(_: Result, f: FormData): Promise<Result> {
  const p = z
    .object({
      caseId: z.uuid(),
      revision: z.coerce.number().int().min(0),
      decision: z.enum(["closed", "rejected"]),
      note: z.string().trim().min(5).max(1000),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return {
      message: "Choose a decision, explain it to the customer and confirm.",
    };
  return staffRpc(
    "resolve_return_case",
    {
      p_case: p.data.caseId,
      p_revision: p.data.revision,
      p_decision: p.data.decision,
      p_note: p.data.note,
    },
    "Return case resolution recorded.",
  );
}
export async function manageRefund(_: Result, f: FormData): Promise<Result> {
  const p = z
    .object({
      id: z.uuid(),
      action: z.enum(["cancel", "reconcile"]),
      providerId: z.string().trim().max(160),
    })
    .safeParse(Object.fromEntries(f));
  if (!p.success || f.get("confirmed") !== "on")
    return {
      message:
        "Confirm refund management and the provider reference if reconciling.",
    };
  return staffRpc(
    "manage_order_refund",
    {
      p_id: p.data.id,
      p_action: p.data.action,
      p_provider_id: p.data.providerId || null,
    },
    "Refund management recorded. A supplied provider ID must still pass canonical verification.",
  );
}
