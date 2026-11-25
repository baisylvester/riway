"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import { bonusCampaignSchema } from "@/lib/bonus-campaigns";
type Result = { message: string; ok?: boolean };
export async function approveBonus(_: Result, f: FormData): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const definition = bonusCampaignSchema.safeParse({
    ...Object.fromEntries(f),
    minimumQuantity: Number(f.get("minimumQuantity")),
    bonusQuantity: Number(f.get("bonusQuantity")),
    maximumPerOrder: Number(f.get("maximumPerOrder")),
    maximumUnits: Number(f.get("maximumUnits")),
    allowVoucher: f.get("allowVoucher") === "on",
    capacityAfterRefund: f.get("capacityApproved") === "on" ? "retain" : null,
  });
  const market = z.enum(["PH", "SG", "MY"]).safeParse(f.get("market"));
  const reference = z
    .string()
    .trim()
    .min(5)
    .max(200)
    .safeParse(f.get("reference"));
  if (
    !definition.success ||
    !market.success ||
    !reference.success ||
    f.get("confirmed") !== "on"
  )
    return {
      message:
        "Complete the campaign, UTC timestamps, approval reference and policy confirmations.",
    };
  const { client } = await session();
  const { error } = await client.rpc("approve_bonus_campaign", {
    p_market: market.data,
    p_definition: definition.data,
    p_reference: reference.data,
  });
  if (error)
    return {
      message:
        "Approval denied. Check market/compliance access, approved products and an existing active campaign for this qualifier.",
    };
  revalidatePath("/admin/bonuses");
  revalidatePath("/checkout");
  return { ok: true, message: "Bonus campaign approved." };
}
export async function withdrawBonus(_: Result, f: FormData): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const parsed = z
    .object({ id: z.uuid(), reference: z.string().trim().min(5).max(200) })
    .safeParse(Object.fromEntries(f));
  if (!parsed.success || f.get("confirmed") !== "on")
    return { message: "Confirm withdrawal and enter a reference." };
  const { client } = await session();
  const { error } = await client.rpc("withdraw_bonus_campaign", {
    p_id: parsed.data.id,
    p_reference: parsed.data.reference,
  });
  if (error) return { message: "Withdrawal denied." };
  revalidatePath("/admin/bonuses");
  revalidatePath("/checkout");
  return {
    ok: true,
    message: "Campaign withdrawn. Existing orders keep their bonus goods.",
  };
}
