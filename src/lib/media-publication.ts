import { z } from "zod";

export const mediaBuckets = {
  private: "editorial-media",
  public: "editorial-public",
} as const;

const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Deterministic public object path; null for unsupported input. */
export function publicMediaPath(
  market: string,
  id: string,
  mime: string,
): string | null {
  const ext = extensions[mime];
  if (!ext || !/^(PH|SG|MY)$/.test(market) || !z.uuid().safeParse(id).success)
    return null;
  return `${market}/${id}.${ext}`;
}

export const mediaPublishSchema = z.object({
  id: z.uuid(),
  reference: z.string().trim().min(3).max(120),
});
