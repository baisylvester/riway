"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import { eventDateSchema, marketSchema } from "@/lib/domain";
type Result = { message: string; ok?: boolean };
export async function resolveSupport(id: string) {
  if (!z.uuid().safeParse(id).success || !(await staff())) return;
  const { client } = await session();
  await client
    .from("support_tickets")
    .update({ status: "resolved" })
    .eq("id", id);
  revalidatePath("/admin/support");
}
async function staff() {
  const access = await staffAccess();
  return access.allowed && access.mfa;
}
export async function saveProduct(_: Result, f: FormData): Promise<Result> {
  if (!(await staff())) return { message: "Staff access and MFA required." };
  const v = z
    .object({
      id: z.union([z.uuid(), z.literal("")]),
      name: z.string().trim().min(2).max(120),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(120),
      category: z.enum(["Nutrition", "Skincare", "Packages"]),
      subtitle: z.string().trim().max(200),
      description: z.string().trim().max(10000),
      status: z.enum(["draft", "review", "published", "archived"]),
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success) return { message: "Check the product fields and URL slug." };
  const { id, ...data } = v.data;
  const { client } = await session();
  const { error } = id
    ? await client
        .from("products")
        .update(data)
        .eq("id", id)
        .select("id")
        .single()
    : await client.from("products").insert(data);
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  if (!error) {
    revalidatePath("/shop/[slug]", "page");
    revalidatePath("/purtier");
    revalidatePath("/conscientious");
  }
  return {
    message: error
      ? "Save failed. Check your role; publishing requires compliance approval."
      : "Product saved.",
    ok: !error,
  };
}
export async function saveContent(_: Result, f: FormData): Promise<Result> {
  if (!(await staff())) return { message: "Staff access and MFA required." };
  const v = z
    .object({
      id: z.union([z.uuid(), z.literal("")]),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(120),
      kind: z.enum(["page", "story", "event", "article"]),
      title: z.string().trim().min(2).max(160),
      excerpt: z.string().trim().max(1000),
      body: z.string().trim().max(30000),
      status: z.enum(["draft", "review", "published", "archived"]),
      market: z.union([marketSchema, z.literal("")]),
      location: z.string().max(300),
      starts_at: eventDateSchema,
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success) return { message: "Check the content fields." };
  const { id, ...raw } = v.data;
  const data = {
    ...raw,
    market: raw.market || null,
    starts_at: raw.starts_at
      ? new Date(raw.starts_at + "Z").toISOString()
      : null,
  };
  const { client } = await session();
  const { error } = id
    ? await client
        .from("content_entries")
        .update(data)
        .eq("id", id)
        .select("id")
        .single()
    : await client.from("content_entries").insert(data);
  revalidatePath("/admin/content");
  revalidatePath("/stories");
  revalidatePath("/events");
  if (!error) {
    revalidatePath("/");
    revalidatePath("/events/[slug]", "page");
  }
  return {
    message: error
      ? "Save failed. Publishing requires compliance approval and market access."
      : "Content saved.",
    ok: !error,
  };
}
export async function adjustStock(_: Result, f: FormData): Promise<Result> {
  if (!(await staff())) return { message: "Staff access and MFA required." };
  const v = z
    .object({
      product_id: z.uuid(),
      market: marketSchema,
      delta: z.coerce
        .number()
        .int()
        .min(-100000)
        .max(100000)
        .refine((n) => n !== 0),
      reason: z.string().trim().min(5).max(500),
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success)
    return {
      message:
        "Enter a nonzero quantity and a reason of at least 5 characters.",
    };
  const { client } = await session();
  const { error } = await client.rpc("adjust_inventory", {
    p: v.data.product_id,
    m: v.data.market,
    d: v.data.delta,
    r: v.data.reason,
  });
  revalidatePath("/admin/inventory");
  return {
    message: error
      ? "Adjustment rejected. Check permissions and reserved stock."
      : "Stock adjusted and movement recorded.",
    ok: !error,
  };
}
export async function saveOffer(_: Result, f: FormData): Promise<Result> {
  if (!(await staff())) return { message: "Staff access and MFA required." };
  const v = z
    .object({
      product_id: z.uuid(),
      market: marketSchema,
      currency: z.enum(["PHP", "SGD", "MYR"]),
      retail_minor: z.coerce.number().int().positive().max(100000000),
      member_minor: z.union([
        z.literal(""),
        z.coerce.number().int().positive().max(100000000),
      ]),
      max_quantity: z.coerce.number().int().min(1).max(24),
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success)
    return {
      message:
        "Enter approved prices in minor currency units and a quantity limit from 1 to 24.",
    };
  const { client } = await session();
  const { error } = await client.from("product_offers").upsert({
    ...v.data,
    member_minor: v.data.member_minor === "" ? null : v.data.member_minor,
  });
  revalidatePath("/admin/pricing");
  revalidatePath("/shop");
  return {
    message: error
      ? "Price update rejected. Compliance or admin role required."
      : "Prices saved. Regulatory sales approval remains a separate control.",
    ok: !error,
  };
}
