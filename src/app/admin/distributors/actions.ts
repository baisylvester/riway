"use server";
import { z } from "zod";

import { revalidatePath } from "@/lib/revalidation";
import { session, staffAccess } from "@/lib/data";
import {
  cycleRequestSchema,
  materialRequestSchema,
  photoRequestSchema,
} from "@/lib/distributor-dashboard";

export type StaffFormResult = { message: string; ok?: boolean };

export async function saveReorderTiming(
  _: StaffFormResult,
  f: FormData,
): Promise<StaffFormResult> {
  if (!(await verified())) return { message: "Staff verification required." };
  const parsed = z
    .object({
      id: z.uuid(),
      days: z.number().int().min(0).max(30).nullable(),
      reference: z.string().trim().max(120),
    })
    .safeParse({
      id: f.get("productId"),
      days: f.get("leadDays") === "" ? null : Number(f.get("leadDays")),
      reference: f.get("reference") ?? "",
    });
  if (!parsed.success)
    return {
      message:
        "Choose a lead time of 0–30 days, or clear it to stop reminders for this product.",
    };
  const { client } = await session();
  const { error } = await client.rpc("set_reorder_timing", {
    p_product: parsed.data.id,
    p_days: parsed.data.days,
    p_reference: parsed.data.reference || null,
  });
  if (error)
    return {
      message:
        "Timing could not be approved. Administrator/compliance access and an approval reference are required.",
    };
  revalidatePath("/admin/distributors");
  return { ok: true, message: "Reminder timing saved." };
}

async function verified() {
  const access = await staffAccess();
  return !!(access.user && access.allowed && access.mfa);
}

function explain(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501")
    return "Your role, market or authenticator verification does not allow this change.";
  if (error.code === "23514") return "That value is not an approved format.";
  if (["PGRST202", "42883", "42P01"].includes(error.code ?? ""))
    return "This feature is not available yet.";
  if (error.code === "P0001" && error.message) return error.message;
  return fallback;
}

// All three actions are re-authorized by the database (role, market, MFA)
// and audited there; these checks only give earlier feedback.
export async function saveProductCycle(
  _: StaffFormResult,
  form: FormData,
): Promise<StaffFormResult> {
  if (!(await verified()))
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = cycleRequestSchema.safeParse({
    productId: form.get("productId"),
    days: form.get("days") ?? "",
    reference: form.get("reference") ?? "",
  });
  if (!parsed.success)
    return {
      message:
        "Choose a product and a cycle of 7–365 days (or blank to clear).",
    };
  const { client } = await session();
  const { error } = await client.rpc("set_product_replenishment", {
    p_product: parsed.data.productId,
    p_days: parsed.data.days,
    p_reference: parsed.data.reference || null,
  });
  if (error)
    return { message: explain(error, "The cycle could not be saved.") };
  revalidatePath("/admin/distributors");
  return { ok: true, message: "Reorder cycle saved." };
}

export async function saveDistributorPhoto(
  _: StaffFormResult,
  form: FormData,
): Promise<StaffFormResult> {
  if (!(await verified()))
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = photoRequestSchema.safeParse({
    code: form.get("code"),
    url: form.get("url") ?? "",
    reference: form.get("reference") ?? "",
  });
  if (!parsed.success)
    return {
      message: "Enter a distributor code and an approved image location.",
    };
  const { client } = await session();
  const { error } = await client.rpc("set_distributor_photo", {
    p_code: parsed.data.code,
    p_url: parsed.data.url || null,
    p_reference: parsed.data.reference || null,
  });
  if (error)
    return { message: explain(error, "The photo could not be saved.") };
  revalidatePath("/admin/distributors");
  return {
    ok: true,
    message: parsed.data.url
      ? "Store photo published."
      : "Store photo removed.",
  };
}

export async function saveDistributorMaterial(
  _: StaffFormResult,
  form: FormData,
): Promise<StaffFormResult> {
  if (!(await verified()))
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = materialRequestSchema.safeParse({
    id: form.get("id") ?? "",
    market: form.get("market"),
    title: form.get("title"),
    description: form.get("description") ?? "",
    url: form.get("url"),
    reference: form.get("reference"),
    published: form.get("published") ?? "off",
  });
  if (!parsed.success)
    return {
      message:
        "Enter a title, an approved link (this site or official RIWAY locations) and the approval reference.",
    };
  const { client } = await session();
  const { error } = await client.rpc("save_distributor_material", {
    p_id: parsed.data.id ?? null,
    p_market: parsed.data.market,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_url: parsed.data.url,
    p_reference: parsed.data.reference,
    p_published: parsed.data.published,
  });
  if (error)
    return { message: explain(error, "The material could not be saved.") };
  revalidatePath("/admin/distributors");
  return { ok: true, message: "Material saved." };
}
