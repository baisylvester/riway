"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { session } from "@/lib/data";
import { revalidatePath } from "@/lib/revalidation";
import { replenishmentMessage } from "@/lib/replenishment";

type Result = { message: string; ok?: boolean };
const scheduled = {
  id: z.uuid(),
  revision: z.coerce.number().int().positive(),
};
const version = z.string().min(3).max(128);

export async function startSchedule(
  _: Result,
  form: FormData,
): Promise<Result> {
  const data = z
    .object({ order: z.uuid(), rule: z.uuid(), version })
    .safeParse(Object.fromEntries(form));
  if (!data.success || form.get("consent") !== "on")
    return { message: "Review and accept the schedule terms." };
  const { user, client, contactVerified } = await session();
  if (!user || !contactVerified)
    return { message: "Sign in with a verified email to start a schedule." };
  const { error } = await client.rpc("start_replenishment", {
    p_order: data.data.order,
    p_rule: data.data.rule,
    p_version: data.data.version,
  });
  if (error) return { message: replenishmentMessage(error) };
  revalidatePath("/account/replenishment");
  return { message: "Replenishment schedule started.", ok: true };
}

export async function changeSchedule(
  _: Result,
  form: FormData,
): Promise<Result> {
  const data = z
    .object({
      ...scheduled,
      change: z.enum(["pause", "resume", "skip", "cancel"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!data.success) return { message: "Choose a schedule action." };
  const { user, client } = await session();
  if (!user) return { message: "Sign in to manage a schedule." };
  const { error } = await client.rpc("change_replenishment", {
    p_id: data.data.id,
    p_revision: data.data.revision,
    p_action: data.data.change,
  });
  if (error) return { message: replenishmentMessage(error) };
  revalidatePath("/account/replenishment");
  return { message: "Schedule updated.", ok: true };
}

export async function orderRenewal(_: Result, form: FormData): Promise<Result> {
  const data = z
    .object({
      ...scheduled,
      quote: z.string().regex(/^[a-f0-9]{64}$/),
      terms: version,
    })
    .safeParse(Object.fromEntries(form));
  if (!data.success || form.get("consent") !== "on")
    return { message: "Review the price, address and Terms of Sale first." };
  const { user, client, contactVerified } = await session();
  if (!user || !contactVerified)
    return {
      message: "Sign in with a verified email to place the renewal order.",
    };
  const { data: id, error } = await client.rpc("create_replenishment_order", {
    p_id: data.data.id,
    p_revision: data.data.revision,
    p_hash: data.data.quote,
    p_terms: data.data.terms,
  });
  if (error) return { message: replenishmentMessage(error) };
  if (!z.uuid().safeParse(id).success)
    return { message: "Check Orders for the result before retrying." };
  revalidatePath("/account/orders");
  revalidatePath("/account/replenishment");
  redirect(`/account/orders/${id}`);
}
