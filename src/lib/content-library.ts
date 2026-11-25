import { z } from "zod";
export const libraryContentSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().max(2000),
    campaign: z.string().max(120),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    mediaType: z.enum(["image", "video", "document"]),
    url: z
      .string()
      .max(500)
      .regex(
        /^(\/(images|design)\/[A-Za-z0-9._~/-]+|https:\/\/(static\.wixstatic\.com|www\.riway\.com|riway\.com|www\.youtube\.com|youtu\.be|vimeo\.com)\/[A-Za-z0-9._~/%?=&-]+)$/,
      )
      .refine((v) => !/(^|\/)\.{1,2}(\/|$)/.test(v)),
    transcript: z.string().max(20000),
    disclaimer: z.string().max(2000),
  })
  .refine(
    (v) => v.mediaType !== "video" || v.transcript.trim().length >= 10,
    "Video needs an accessible transcript.",
  );
export const libraryAssetSchema = libraryContentSchema.extend({
  id: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]).nullable(),
  version: z.number().int(),
  revision: z.number().int().optional(),
  liveVersion: z.number().int().nullable().optional(),
});
export const libraryResultsSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  assets: z.array(libraryAssetSchema),
});
export type LibraryAsset = z.infer<typeof libraryAssetSchema>;
export function libraryQuery(q: Record<string, string | string[] | undefined>) {
  const scalar = (key: string) =>
    typeof q[key] === "string" ? (q[key] as string) : "";
  const page = Number(scalar("page") || 0);
  return {
    search: scalar("q").slice(0, 120),
    locale: /^[a-z]{2}(-[A-Z]{2})?$/.test(scalar("locale"))
      ? scalar("locale")
      : null,
    type: ["image", "video", "document"].includes(scalar("type"))
      ? scalar("type")
      : null,
    page: Number.isInteger(page) && page >= 0 && page <= 10000 ? page : 0,
  };
}
