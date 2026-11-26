"use server";

import { z } from "zod";
import { session, staffAccess } from "@/lib/data";
import { marketSchema } from "@/lib/domain";
import { replenishmentMessage } from "@/lib/replenishment";
import { revalidatePath } from "@/lib/revalidation";

type Result = { message: string; ok?: boolean };

export async function approveRule(_: Result, form: FormData): Promise<Result> {
  const input = z
    .object({
      market: marketSchema,
      product: z.uuid(),
      days: z.coerce.number().int().min(1).max(365),
      version: z.string().trim().min(3).max(120),
      terms: z.string().trim().min(20).max(8000),
      reference: z.string().trim().min(5).max(160),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success || form.get("approved") !== "on")
    return {
      message: "Enter the approved schedule terms, interval and reference.",
    };
  const { allowed, mfa } = await staffAccess();
  if (!allowed || !mfa)
    return { message: "Staff access and MFA are required." };
  const { client } = await session();
  const d = input.data;
  const { error } = await client.rpc("save_replenishment_rule", {
    p_market: d.market,
    p_product: d.product,
    p_days: d.days,
    p_version: d.version,
    p_terms: d.terms,
    p_reference: d.reference,
  });
  if (error) return { message: replenishmentMessage(error) };
  revalidatePath("/admin/replenishment");
  revalidatePath("/account/replenishment");
  return { ok: true, message: "Replenishment terms approved." };
}

export async function withdrawRule(_: Result, form: FormData): Promise<Result> {
  const rule = z.uuid().safeParse(form.get("rule"));
  if (!rule.success || form.get("confirmed") !== "on")
    return { message: "Confirm withdrawal of this rule." };
  const { allowed, mfa } = await staffAccess();
  if (!allowed || !mfa)
    return { message: "Staff access and MFA are required." };
  const { client } = await session();
  const { error } = await client.rpc("withdraw_replenishment_rule", {
    p_id: rule.data,
  });
  if (error) return { message: replenishmentMessage(error) };
  revalidatePath("/admin/replenishment");
  revalidatePath("/account/replenishment");
  return { ok: true, message: "Replenishment terms withdrawn." };
}
