"use server";
import { z } from "zod";
import { revalidatePath } from "@/lib/revalidation";
import { session } from "@/lib/data";
type Result = { message: string; ok?: boolean };
export async function saveReorderPreference(
  _: Result,
  f: FormData,
): Promise<Result> {
  const { client, user } = await session();
  if (!user) return { message: "Sign in required." };
  const revision = z.coerce
    .number()
    .int()
    .nonnegative()
    .safeParse(f.get("revision"));
  if (!revision.success || f.get("version") !== "reorder-email-v1")
    return { message: "Reload the current communication preferences." };
  const { error } = await client.rpc("set_reorder_preference", {
    p_enabled: f.get("email") === "on",
    p_revision: revision.data,
    p_version: "reorder-email-v1",
  });
  if (error)
    return {
      message:
        error.code === "40001"
          ? "Preferences changed. Reload before saving."
          : "Preferences could not be saved.",
    };
  revalidatePath("/account/preferences");
  return { ok: true, message: "Reorder email preference saved." };
}
