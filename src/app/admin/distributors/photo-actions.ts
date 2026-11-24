"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session, staffAccess } from "@/lib/data";
import { photoBuckets } from "@/lib/distributor-directory";

export type ReviewResult = { message: string; ok?: boolean };

const reviewSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  market: z.enum(["PH", "SG", "MY"]),
  objectPath: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/),
  reference: z.string().trim().max(120),
  note: z.string().trim().max(300),
});

// Approving copies the submitted image into the public bucket under the
// distributor's market, then records the public URL. Storage policies and the
// review function both recheck market admin/compliance with MFA.
export async function reviewPhoto(
  _: ReviewResult,
  form: FormData,
): Promise<ReviewResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa)
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Check the review fields." };
  const v = parsed.data;
  const { client } = await session();
  let publicUrl: string | null = null;
  if (v.decision === "approve") {
    if (v.reference.length < 3)
      return { message: "Enter the approval reference to publish this photo." };
    const file = await client.storage
      .from(photoBuckets.submissions)
      .download(v.objectPath);
    if (file.error || !file.data)
      return { message: "The submitted photo could not be read." };
    const ext = v.objectPath.split(".").pop()!;
    const target = `${v.market}/${crypto.randomUUID()}.${ext}`;
    const put = await client.storage
      .from(photoBuckets.published)
      .upload(target, file.data, {
        contentType: file.data.type || undefined,
        upsert: false,
      });
    if (put.error)
      return {
        message: "The photo could not be published. Check your market role.",
      };
    publicUrl = client.storage.from(photoBuckets.published).getPublicUrl(target)
      .data.publicUrl;
  }
  const { error } = await client.rpc("review_distributor_photo", {
    p_id: v.id,
    p_approve: v.decision === "approve",
    p_public_url: publicUrl,
    p_reference: v.reference || null,
    p_note: v.note || null,
  });
  if (error)
    return {
      message:
        error.code === "42501"
          ? "Your role or market does not allow this review."
          : error.code === "P0001"
            ? error.message
            : "The review could not be saved.",
    };
  revalidatePath("/admin/distributors");
  return {
    ok: true,
    message: v.decision === "approve" ? "Photo published." : "Photo rejected.",
  };
}
