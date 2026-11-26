"use server";
import { revalidatePath } from "@/lib/revalidation";
import { z } from "zod";
import { session, staffAccess } from "@/lib/data";
import { libraryContentSchema } from "@/lib/content-library";
type Result = { message: string; ok?: boolean };
export async function saveLibraryVersion(
  _: Result,
  f: FormData,
): Promise<Result> {
  try {
    const a = await staffAccess();
    if (!a.allowed || !a.mfa)
      return { message: "Staff verification required." };
    const content = libraryContentSchema.safeParse(Object.fromEntries(f));
    const meta = z
      .object({
        id: z.uuid().nullable(),
        revision: z.number().int().nonnegative(),
        market: z.enum(["PH", "SG", "MY"]).nullable(),
      })
      .safeParse({
        id: f.get("id") || null,
        revision: Number(f.get("revision") || 0),
        market: f.get("market") === "ALL" ? null : f.get("market"),
      });
    if (!content.success || !meta.success)
      return {
        message: !content.success
          ? content.error.issues[0].message
          : "Check market and version.",
      };
    const { client } = await session();
    const { error } = await client.rpc("save_library_version", {
      p_id: meta.data.id,
      p_revision: meta.data.revision,
      p_market: meta.data.market,
      p_content: content.data,
    });
    if (error)
      return {
        message:
          error.code === "40001"
            ? "Asset changed. Reload before editing."
            : "This draft could not be saved. Check your market access and fields.",
      };
    revalidatePath("/admin/library");
    return {
      ok: true,
      message:
        "New draft version saved. Another reviewer must approve it before sharing.",
    };
  } catch {
    return {
      message: "The library could not be updated. Reload before retrying.",
    };
  }
}
export async function reviewLibraryVersion(
  _: Result,
  f: FormData,
): Promise<Result> {
  try {
    const a = await staffAccess();
    if (!a.allowed || !a.mfa)
      return { message: "Staff verification required." };
    const v = z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        reference: z.string().trim().min(3).max(120),
      })
      .safeParse({
        id: f.get("id"),
        revision: Number(f.get("revision")),
        reference: f.get("reference"),
      });
    if (!v.success || f.get("confirmed") !== "on")
      return {
        message: "Enter the review reference and confirm your decision.",
      };
    const { client } = await session();
    const withdraw = f.get("withdraw") === "on";
    const { error } = await client.rpc("review_library_version", {
      p_id: v.data.id,
      p_revision: v.data.revision,
      p_reference: v.data.reference,
      p_withdraw: withdraw,
    });
    if (error)
      return {
        message:
          error.code === "40001"
            ? "Asset changed. Reload before reviewing."
            : "Review denied. Publication requires a different authorized reviewer in the asset’s market.",
      };
    revalidatePath("/admin/library");
    revalidatePath("/distributor/library");
    revalidatePath(`/materials/${v.data.id}`);
    return {
      ok: true,
      message: withdraw
        ? "Asset withdrawn from the library and sharing page."
        : "Version published.",
    };
  } catch {
    return {
      message: "The review could not be confirmed. Reload to check its status.",
    };
  }
}
