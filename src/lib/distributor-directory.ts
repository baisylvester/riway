import { z } from "zod";

// Mirrors private.my_distributor_listing() and find_distributors().
export const myListingSchema = z.object({
  userId: z.uuid(),
  listed: z.boolean(),
  city: z.string().nullable(),
  photoUrl: z.string().nullable(),
  pendingPhoto: z.boolean(),
});
export type MyListing = z.infer<typeof myListingSchema>;

export const directoryEntrySchema = z.object({
  code: z.string(),
  display_name: z.string(),
  market: z.enum(["PH", "SG", "MY"]),
  city: z.string().nullable(),
  photo_url: z.string().nullable(),
});

export const listingRequestSchema = z.object({
  listed: z.enum(["on", "off"]).transform((v) => v === "on"),
  city: z
    .string()
    .trim()
    .max(80)
    .regex(/^[\p{L}\s.'-]*$/u, "Use letters only for the city."),
});

export const photoBuckets = {
  submissions: "distributor-photo-submissions",
  published: "distributor-photos",
} as const;
