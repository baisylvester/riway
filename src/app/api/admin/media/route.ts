import { NextResponse } from "next/server";
import { session, staffAccess } from "@/lib/data";
import { failure, sameOrigin } from "@/lib/http";
import { marketSchema } from "@/lib/domain";
import { imageExtension } from "@/lib/files";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin", 403);
  const access = await staffAccess();
  if (!access.allowed || !access.mfa)
    return failure("Staff access and MFA required.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 3300000)
    return failure("Maximum file size is 3 MiB.", 413);
  const form = await request.formData();
  const market = marketSchema.safeParse(form.get("market")),
    file = form.get("file");
  if (
    !market.success ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 3145728
  )
    return failure("Choose a PNG, JPEG or WebP image up to 3 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    ext = imageExtension(bytes);
  if (!ext) return failure("This file is not a supported image.");
  const path = `${market.data}/${crypto.randomUUID()}.${ext}`,
    mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[ext],
    { client, user } = await session();
  const { error: upload } = await client.storage
    .from("editorial-media")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload)
    return failure("Upload failed. Check market permissions and file size.");
  const { error } = await client.from("media_assets").insert({
    market: market.data,
    object_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: mime,
    size_bytes: file.size,
    uploaded_by: user!.id,
  });
  if (error) {
    await client.storage.from("editorial-media").remove([path]);
    return failure("Media metadata could not be saved.");
  }
  return NextResponse.json({ saved: true }, { status: 201 });
}
