"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
type Result = { message: string; ok?: boolean };
export async function saveEventAdmission(
  _: Result,
  f: FormData,
): Promise<Result> {
  const a = await staffAccess();
  if (!a.allowed || !a.mfa) return { message: "Staff verification required." };
  const v = z
    .object({
      id: z.uuid(),
      capacity: z.number().int().min(1).max(100000),
      revision: z.number().int().nonnegative(),
      reference: z.string().trim().min(3).max(120),
    })
    .safeParse({
      id: f.get("id"),
      capacity: Number(f.get("capacity")),
      revision: Number(f.get("revision")),
      reference: f.get("reference"),
    });
  if (!v.success)
    return {
      message: "Check event, capacity, revision and approval reference.",
    };
  const { client } = await session();
  const { error } = await client.rpc("save_event_admission", {
    p_event: v.data.id,
    p_capacity: v.data.capacity,
    p_revision: v.data.revision,
    p_reference: v.data.reference,
  });
  if (error)
    return {
      message:
        error.code === "40001"
          ? "Rules changed. Reload."
          : "Could not approve capacity. Check your market/compliance role and current attendance.",
    };
  revalidatePath("/admin/events");
  return { ok: true, message: "Capacity approved." };
}
export async function changeEventAttendance(
  _: Result,
  f: FormData,
): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Sign in required." };
  const v = z
    .object({ id: z.uuid(), revision: z.number().int().nonnegative() })
    .safeParse({ id: f.get("id"), revision: Number(f.get("revision")) });
  if (!v.success || f.get("confirmed") !== "on")
    return { message: "Confirm the registration change." };
  const checkIn = f.get("checkIn") === "on";
  if (checkIn) {
    const a = await staffAccess();
    if (!a.allowed || !a.mfa)
      return { message: "Staff verification required." };
  }
  const { error } = await client.rpc("change_event_attendance", {
    p_id: v.data.id,
    p_revision: v.data.revision,
    p_check_in: checkIn,
  });
  if (error)
    return {
      message:
        error.code === "40001"
          ? "Registration changed. Reload."
          : "Change denied. Check ownership, market, registration status and event time.",
    };
  revalidatePath("/admin/events");
  revalidatePath("/events/[slug]", "page");
  return {
    ok: true,
    message: checkIn ? "Attendee checked in." : "Registration cancelled.",
  };
}
