"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session, staffAccess } from "@/lib/data";

export type RetryResult = { message: string; ok?: boolean };

// Returns one failed event to the queue; the database rechecks market role,
// MFA and that the event is still failed, and writes the audit entry.
export async function retryCompensationEvent(
  _: RetryResult,
  form: FormData,
): Promise<RetryResult> {
  try {
    const access = await staffAccess();
    if (!access.user || !access.allowed || !access.mfa)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const id = z.uuid().safeParse(form.get("id"));
    if (!id.success) return { message: "Choose an event to retry." };
    const { client } = await session();
    const { data, error } = await client.rpc("retry_compensation_event", {
      p_id: id.data,
    });
    if (error)
      return {
        message:
          error.code === "42501"
            ? "Market administrator or operations access with verified MFA is required."
            : "The event could not be queued again. Reload and try again.",
      };
    revalidatePath("/admin/compensation");
    return data === true
      ? { ok: true, message: "Queued for another delivery attempt." }
      : { message: "This event is no longer failed. Reload the page." };
  } catch {
    return { message: "The sync queue could not be reached. Please retry." };
  }
}
