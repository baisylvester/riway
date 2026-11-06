"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session } from "@/lib/data";
import { marketSchema } from "@/lib/domain";
type Result = { message: string; ok?: boolean };
const movement = z
  .object({
    tenant: z.uuid(),
    location: z.uuid(),
    product: z.uuid(),
    operation: z.enum([
      "receive",
      "adjust",
      "reserve",
      "release",
      "allocate",
      "fulfill",
      "damage",
      "restore",
    ]),
    quantity: z.coerce
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((q) => q !== 0),
    reason: z.string().trim().min(5).max(500),
    key: z.uuid(),
  })
  .refine((v) => v.operation === "adjust" || v.quantity > 0);
export async function moveStock(_: Result, form: FormData): Promise<Result> {
  const input = movement.safeParse(Object.fromEntries(form));
  if (!input.success) return { message: "Check the stock movement fields." };
  const { user, client } = await session();
  if (!user) return { message: "Sign in to continue." };
  const v = input.data;
  const { error } = await client.rpc("mutate_tenant_stock", {
    t: v.tenant,
    l: v.location,
    p: v.product,
    op: v.operation,
    q: v.quantity,
    reason: v.reason,
    key: v.key,
  });
  revalidatePath("/operations");
  return {
    ok: !error,
    message: error
      ? "Movement rejected. Check store access, MFA and available stock."
      : "Stock movement recorded.",
  };
}

export async function setupInventory(
  _: Result,
  form: FormData,
): Promise<Result> {
  const { user, client } = await session();
  if (!user) return { message: "Sign in to continue." };
  const kind = form.get("kind");
  const tenant = z.uuid().safeParse(form.get("tenant"));
  let error: { code?: string } | null = null;
  if (kind === "tenant") {
    const input = z
      .object({ name: z.string().trim().min(2).max(120), owner: z.uuid() })
      .safeParse(Object.fromEntries(form));
    if (!input.success)
      return {
        message: "Enter a store name and its owner's RIWAY account ID.",
      };
    ({ error } = await client.rpc("create_tenant", {
      n: input.data.name,
      owner_id: input.data.owner,
    }));
  } else {
    if (!tenant.success) return { message: "Choose a store." };
    let payload: Record<string, string>;
    if (kind === "location") {
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          market: marketSchema,
        })
        .safeParse(Object.fromEntries(form));
      if (!input.success)
        return { message: "Enter a location name and market." };
      payload = input.data;
    } else if (kind === "product") {
      const input = z
        .object({
          product_id: z.uuid(),
          sku: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
        })
        .safeParse(Object.fromEntries(form));
      if (!input.success) return { message: "Choose a product and valid SKU." };
      payload = input.data;
    } else if (kind === "member" || kind === "access") {
      const input = z
        .object({
          user_id: z.uuid(),
          role:
            kind === "access"
              ? z.enum(["owner", "inventory", "viewer", "revoke"])
              : z.enum(["owner", "inventory", "viewer"]),
        })
        .safeParse(Object.fromEntries(form));
      if (!input.success)
        return { message: "Enter an existing account ID and role." };
      payload = input.data;
    } else if (kind === "status") {
      const active = z.enum(["true", "false"]).safeParse(form.get("active"));
      if (!active.success) return { message: "Choose a store status." };
      payload = { active: active.data };
    } else return { message: "Invalid setup operation." };
    ({ error } = await client.rpc("setup_tenant_inventory", {
      t: tenant.data,
      kind,
      payload,
    }));
  }
  revalidatePath("/operations");
  if (error?.code === "P0002")
    return {
      ok: false,
      message:
        "This account is not a store member. Use Add store member first.",
    };
  return {
    ok: !error,
    message: error
      ? "Setup rejected. Check permissions, MFA, duplicate records and account IDs."
      : "Store setup saved.",
  };
}

export async function setStockThreshold(
  _: Result,
  form: FormData,
): Promise<Result> {
  const input = z
    .object({
      tenant: z.uuid(),
      location: z.uuid(),
      product: z.uuid(),
      threshold: z.coerce.number().int().min(0).max(1000000),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      ok: false,
      message: "Choose a location, SKU and threshold from 0 to 1,000,000.",
    };
  const { user, client } = await session();
  if (!user) return { ok: false, message: "Sign in to continue." };
  const v = input.data;
  const { error } = await client.rpc("set_tenant_stock_threshold", {
    t: v.tenant,
    l: v.location,
    p: v.product,
    threshold: v.threshold,
  });
  revalidatePath("/operations");
  return {
    ok: !error,
    message: error
      ? "Threshold rejected. Check store owner access, MFA and the selected SKU/location."
      : "Low-stock threshold saved.",
  };
}
