"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session, staffAccess } from "@/lib/data";
import {
  mediaBuckets,
  publicMediaPath,
  mediaPublishSchema,
} from "@/lib/media-publication";

export type MediaResult = { message: string; ok?: boolean };

const denied = {
  message: "Staff access and second-step verification are required.",
};

function failure(error: { code?: string; message?: string }): MediaResult {
  if (error.code === "42501")
    return {
      message:
        "Your role or market does not allow this. Media must be published by a market admin or compliance reviewer other than the uploader.",
    };
  if (error.code === "P0001" && error.message)
    return { message: error.message };
  return { message: "The change could not be saved." };
}

// Publishing copies the private editorial image into the public bucket at
// <market>/<asset id>.<ext>, then records the URL. Storage policies and the
// database function both recheck market admin/compliance, second step and
// that the publisher is not the uploader.
export async function publishMedia(
  _: MediaResult,
  form: FormData,
): Promise<MediaResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return denied;
  const parsed = mediaPublishSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { message: "Enter an approval reference of 3 to 120 characters." };
  const { client, user } = await session();
  const { data: asset, error } = await client
    .from("media_assets")
    .select(
      "id,market,object_path,mime_type,storage_provider,public_url,uploaded_by",
    )
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (error || !asset) return { message: "This media is not available." };
  if (asset.public_url) return { message: "This media is already published." };
  if (asset.storage_provider !== "supabase")
    return { message: "Only Supabase-stored media can be published." };
  if (asset.uploaded_by === user?.id)
    return {
      message:
        "Ask another market admin or compliance reviewer to publish your upload.",
    };
  const target = publicMediaPath(asset.market, asset.id, asset.mime_type);
  if (!target) return { message: "This media type cannot be published." };
  const file = await client.storage
    .from(mediaBuckets.private)
    .download(asset.object_path);
  if (file.error || !file.data)
    return { message: "The original image could not be read." };
  const put = await client.storage
    .from(mediaBuckets.public)
    .upload(target, file.data, { contentType: asset.mime_type, upsert: false });
  if (put.error)
    return {
      message: "The image could not be published. Check your market role.",
    };
  const url = client.storage.from(mediaBuckets.public).getPublicUrl(target)
    .data.publicUrl;
  const saved = await client.rpc("publish_media_asset", {
    p_id: asset.id,
    p_public_url: url,
    p_reference: parsed.data.reference,
  });
  if (saved.error) {
    await client.storage.from(mediaBuckets.public).remove([target]);
    return failure(saved.error);
  }
  revalidatePath("/admin/media");
  return { ok: true, message: "Image published." };
}

export async function unpublishMedia(
  _: MediaResult,
  form: FormData,
): Promise<MediaResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return denied;
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { message: "This media is not available." };
  const { client } = await session();
  const { data: path, error } = await client.rpc("unpublish_media_asset", {
    p_id: id.data,
  });
  if (error) return failure(error);
  revalidatePath("/admin/media");
  const removed =
    typeof path === "string"
      ? await client.storage.from(mediaBuckets.public).remove([path])
      : { error: true };
  return removed.error
    ? {
        ok: true,
        message:
          "Image unpublished. The public file could not be removed; ask an administrator to delete it.",
      }
    : {
        ok: true,
        message: "Image unpublished and removed from public storage.",
      };
}
