"use server";

import { revalidatePath } from "next/cache";
import { session } from "@/lib/data";
import { imageExtension } from "@/lib/files";
import {
  listingRequestSchema,
  myListingSchema,
  photoBuckets,
} from "@/lib/distributor-directory";

export type DistributorResult = { message: string; ok?: boolean };

// Opt in or out of the public Find a Distributor list. The database checks
// that the caller is an active, verified distributor.
export async function saveListing(
  _: DistributorResult,
  form: FormData,
): Promise<DistributorResult> {
  const parsed = listingRequestSchema.safeParse({
    listed: form.get("listed") ?? "off",
    city: form.get("city") ?? "",
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Check the fields." };
  const { client, user } = await session();
  if (!user) return { message: "Sign in again to continue." };
  const { error } = await client.rpc("set_distributor_listing", {
    p_listed: parsed.data.listed,
    p_city: parsed.data.city || null,
  });
  if (error)
    return {
      message:
        error.code === "42501"
          ? "Only verified distributors can be listed."
          : "Your listing could not be saved.",
    };
  revalidatePath("/distributor");
  revalidatePath("/find-a-distributor");
  return {
    ok: true,
    message: parsed.data.listed
      ? "You are listed in Find a Distributor."
      : "You are no longer listed.",
  };
}

// Upload a photo for RIWAY review. It is stored privately and appears on
// your store page only after market compliance approves it.
export async function submitPhoto(
  _: DistributorResult,
  form: FormData,
): Promise<DistributorResult> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size < 1 || file.size > 3145728)
    return { message: "Choose a PNG, JPEG or WebP image up to 3 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = imageExtension(bytes);
  if (!ext) return { message: "This file is not a supported image." };
  const { client, user } = await session();
  if (!user) return { message: "Sign in again to continue." };
  const me = myListingSchema.safeParse(
    (await client.rpc("my_distributor_listing")).data,
  );
  if (!me.success)
    return { message: "Only verified distributors can upload a photo." };
  const path = `${me.data.userId}/${crypto.randomUUID()}.${ext}`;
  const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[ext];
  const upload = await client.storage
    .from(photoBuckets.submissions)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error)
    return { message: "Upload is unavailable. Please try again." };
  const { error } = await client.rpc("submit_distributor_photo", {
    p_path: path,
  });
  if (error) {
    await client.storage.from(photoBuckets.submissions).remove([path]);
    return { message: "Your photo could not be submitted." };
  }
  revalidatePath("/distributor");
  return { ok: true, message: "Photo sent for RIWAY review." };
}
