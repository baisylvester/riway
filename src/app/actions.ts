"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session } from "@/lib/data";
import { addressSchema, marketSchema } from "@/lib/domain";
type Result = { message: string; ok?: boolean };
export async function saveProfile(_: Result, f: FormData): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Please sign in." };
  const v = z
    .object({
      full_name: z.string().trim().min(2).max(100),
      phone: z.string().trim().max(25),
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success) return { message: "Check your name and phone number." };
  const { error } = await client.from("profiles").upsert({
    id: user.id,
    ...v.data,
    marketing_consent: f.get("marketing_consent") === "on",
  });
  revalidatePath("/account");
  return {
    message: error ? "Profile could not be saved." : "Profile saved.",
    ok: !error,
  };
}
export async function saveAddress(_: Result, f: FormData): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Please sign in." };
  const v = addressSchema.safeParse(Object.fromEntries(f));
  if (!v.success) return { message: "Check all address fields." };
  const { error } = await client
    .from("addresses")
    .insert({ user_id: user.id, ...v.data });
  revalidatePath("/account/addresses");
  return {
    message: error ? "Address could not be saved." : "Address saved.",
    ok: !error,
  };
}
export async function deleteAddress(id: string) {
  if (!z.uuid().safeParse(id).success) return;
  const { client, user } = await session();
  if (!user) return;
  await client.from("addresses").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/account/addresses");
}
export async function sendSupport(_: Result, f: FormData): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Sign in before sending a support request." };
  const v = z
    .object({
      subject: z.string().trim().min(5).max(160),
      message: z.string().trim().min(20).max(4000),
      market: marketSchema,
    })
    .safeParse(Object.fromEntries(f));
  if (!v.success)
    return {
      message:
        "Use a subject of at least 5 characters and a message of 20–4000 characters.",
    };
  const { error } = await client
    .from("support_tickets")
    .insert({ user_id: user.id, ...v.data });
  return {
    message: error
      ? "Your request could not be sent. Please try again."
      : "Your support request has been recorded.",
    ok: !error,
  };
}
export async function registerEvent(_: Result, f: FormData): Promise<Result> {
  const id = f.get("event_id");
  if (!z.uuid().safeParse(id).success) return { message: "Invalid event." };
  const { client, user } = await session();
  if (!user) return { message: "Please sign in to register." };
  const { error } = await client
    .from("event_registrations")
    .insert({ user_id: user.id, event_id: id });
  return {
    message: error
      ? error.code === "23505"
        ? "You are already registered."
        : "Registration is unavailable for this event."
      : "Your registration is confirmed.",
    ok: !error,
  };
}
