"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
type Result = { message: string; ok?: boolean };
export async function saveServiceCentre(
  _: Result,
  f: FormData,
): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const parsed = z
    .object({
      id: z.uuid().nullable(),
      revision: z.number().int().nonnegative(),
      market: z.enum(["PH", "SG", "MY"]),
      name: z.string().trim().min(3).max(120),
      line1: z.string().trim().min(5).max(200),
      city: z.string().trim().min(2).max(100),
      postalCode: z.string().trim().min(3).max(15),
      instructions: z.string().trim().min(10).max(2000),
      reference: z.string().trim().min(3).max(120),
    })
    .safeParse({
      ...Object.fromEntries(f),
      id: f.get("id") || null,
      revision: Number(f.get("revision") || 0),
    });
  if (!parsed.success || f.get("noFeeApproved") !== "on")
    return {
      message:
        "Complete all centre details and explicitly approve collection without an additional fee.",
    };
  const v = parsed.data;
  const { client } = await session();
  const { error } = await client.rpc("save_service_centre", {
    p_id: v.id,
    p_revision: v.revision,
    p_market: v.market,
    p_details: {
      name: v.name,
      line1: v.line1,
      city: v.city,
      postalCode: v.postalCode,
      instructions: v.instructions,
      noFeeApproved: true,
    },
    p_active: f.get("active") === "on",
    p_reference: v.reference,
  });
  if (error)
    return {
      message:
        error.code === "40001"
          ? "Centre changed. Reload before editing."
          : "Centre approval denied. Check administrator/compliance access for this market.",
    };
  revalidatePath("/admin/centres");
  revalidatePath("/checkout");
  return { ok: true, message: "Service-centre revision approved." };
}
