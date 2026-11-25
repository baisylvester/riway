"use server";
import { revalidatePath } from "next/cache";
import { session } from "@/lib/data";
import {
  slotSchema,
  bookingSchema,
  consultationProblem,
} from "@/lib/consultations";
type Result = { message: string; ok?: boolean };
export async function saveSlot(_: Result, f: FormData): Promise<Result> {
  try {
    const { client, user } = await session();
    if (!user) return { message: "Please sign in." };
    const parsed = slotSchema.safeParse({
      id: f.get("id") || null,
      startsAt: f.get("startsAt"),
      endsAt: f.get("endsAt"),
      timezone: f.get("timezone"),
      active: f.get("active") !== "off",
    });
    if (!parsed.success) return { message: parsed.error.issues[0].message };
    const v = parsed.data;
    const { error } = await client.rpc("save_consultation_slot", {
      p_id: v.id,
      p_start: v.startsAt,
      p_end: v.endsAt,
      p_timezone: v.timezone,
      p_active: v.active,
    });
    if (error) return { message: consultationProblem(error.code) };
    revalidatePath("/account/consultations");
    return {
      ok: true,
      message: v.active ? "Availability saved." : "Availability withdrawn.",
    };
  } catch {
    return { message: consultationProblem() };
  }
}
export async function changeBooking(_: Result, f: FormData): Promise<Result> {
  try {
    const { client, user } = await session();
    if (!user) return { message: "Please sign in." };
    const parsed = bookingSchema.safeParse({
      id: f.get("id") || null,
      slotId: f.get("slotId") || null,
      revision: Number(f.get("revision") || 0),
      timezone: f.get("timezone"),
      cancel: f.get("cancel") === "on",
    });
    if (!parsed.success) return { message: parsed.error.issues[0].message };
    if (f.get("confirmed") !== "on")
      return { message: "Confirm the booking change." };
    const v = parsed.data;
    const { error } = await client.rpc("change_consultation", {
      p_booking: v.id,
      p_slot: v.slotId,
      p_revision: v.revision,
      p_timezone: v.timezone,
      p_cancel: v.cancel,
    });
    if (error) return { message: consultationProblem(error.code) };
    revalidatePath("/account/consultations");
    return {
      ok: true,
      message: v.cancel
        ? "Consultation cancelled."
        : "Consultation booked. You can review it below.",
    };
  } catch {
    return { message: consultationProblem() };
  }
}
