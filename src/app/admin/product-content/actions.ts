"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import { productContentRequestSchema } from "@/lib/product-content";

export type ContentResult = { message: string; ok?: boolean };

// Editors save drafts or send for review; the database lets only market
// admin/compliance (MFA) publish, and requires an approval reference.
export async function saveProductContent(
  _: ContentResult,
  form: FormData,
): Promise<ContentResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa)
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = productContentRequestSchema.safeParse(
    Object.fromEntries(form),
  );
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Check the fields." };
  const v = parsed.data;
  const { client } = await session();
  const { error } = await client.from("product_market_content").upsert(
    {
      product_id: v.productId,
      market: v.market,
      locale: "en",
      ingredients: v.ingredients,
      usage: v.usage,
      label_notes: v.labelNotes,
      regulatory_statement: v.regulatoryStatement,
      video_url: v.videoUrl || null,
      status: v.status,
      approval_reference: v.approvalReference || null,
    },
    { onConflict: "product_id,market,locale" },
  );
  if (error)
    return {
      message:
        error.code === "42501"
          ? "Your role or market does not allow this change."
          : error.code === "P0001"
            ? error.message
            : error.code === "23514"
              ? "A field is not in an approved format."
              : "The content could not be saved.",
    };
  revalidatePath("/admin/product-content");
  revalidatePath("/shop/[slug]", "page");
  return {
    ok: true,
    message: v.status === "published" ? "Published." : `Saved as ${v.status}.`,
  };
}
