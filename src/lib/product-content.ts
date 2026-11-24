import { z } from "zod";

// Mirrors public.product_market_content. Only compliance-published rows are
// readable by the public (database policy and publication trigger).
export const productContentSchema = z.object({
  product_id: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  locale: z.string(),
  ingredients: z.string(),
  usage: z.string(),
  label_notes: z.string(),
  regulatory_statement: z.string(),
  video_url: z.string().nullable(),
  status: z.enum(["draft", "review", "published"]),
  approval_reference: z.string().nullable(),
});
export type ProductContent = z.infer<typeof productContentSchema>;

export const videoUrlPattern =
  /^https:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[A-Za-z0-9_-]+$/;

export const productContentRequestSchema = z.object({
  productId: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  ingredients: z.string().trim().max(4000),
  usage: z.string().trim().max(4000),
  labelNotes: z.string().trim().max(2000),
  regulatoryStatement: z.string().trim().max(2000),
  videoUrl: z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => v === "" || videoUrlPattern.test(v),
      "Use a YouTube or Vimeo link.",
    ),
  status: z.enum(["draft", "review", "published"]),
  approvalReference: z.string().trim().max(120),
});
