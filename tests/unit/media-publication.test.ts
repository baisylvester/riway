import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staffAccess: vi.fn(),
  session: vi.fn(),
  asset: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  buckets: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data", () => ({
  staffAccess: mocks.staffAccess,
  session: mocks.session,
}));
const { publishMedia, unpublishMedia } =
  await import("@/app/admin/media/actions");
const { publicMediaPath } = await import("@/lib/media-publication");

const me = "70000000-0000-4000-8000-000000000001";
const uploader = "70000000-0000-4000-8000-000000000002";
const id = "0d9f6a3e-1c2b-4d5e-8f70-112233445566";
const asset = {
  id,
  market: "PH",
  object_path: `PH/${crypto.randomUUID()}.png`,
  mime_type: "image/png",
  storage_provider: "supabase",
  public_url: null,
  uploaded_by: uploader,
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buckets.length = 0;
  mocks.staffAccess.mockResolvedValue({
    user: { id: me },
    allowed: true,
    mfa: true,
  });
  mocks.asset.mockResolvedValue({ data: asset, error: null });
  mocks.download.mockResolvedValue({ data: new Blob(["x"]), error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: mocks.asset,
  };
  mocks.session.mockResolvedValue({
    user: { id: me },
    client: {
      from: () => query,
      rpc: mocks.rpc,
      storage: {
        from: (bucket: string) => {
          mocks.buckets.push(bucket);
          return {
            download: mocks.download,
            upload: mocks.upload,
            remove: mocks.remove,
            getPublicUrl: (path: string) => ({
              data: {
                publicUrl: `https://db.example.invalid/storage/v1/object/public/${bucket}/${path}`,
              },
            }),
          };
        },
      },
    },
  });
});

describe("publicMediaPath", () => {
  it("builds the deterministic market path and rejects anything else", () => {
    expect(publicMediaPath("PH", id, "image/jpeg")).toBe(`PH/${id}.jpg`);
    expect(publicMediaPath("XX", id, "image/png")).toBeNull();
    expect(publicMediaPath("PH", "../x", "image/png")).toBeNull();
    expect(publicMediaPath("PH", id, "image/gif")).toBeNull();
  });
});

describe("publishMedia", () => {
  it("copies the private image to the public bucket and records it", async () => {
    const result = await publishMedia(
      { message: "" },
      form({ id, reference: " QA-REF " }),
    );
    expect(result).toEqual({ ok: true, message: "Image published." });
    expect(mocks.download).toHaveBeenCalledWith(asset.object_path);
    expect(mocks.upload).toHaveBeenCalledWith(
      `PH/${id}.png`,
      expect.any(Blob),
      {
        contentType: "image/png",
        upsert: false,
      },
    );
    expect(mocks.rpc).toHaveBeenCalledWith("publish_media_asset", {
      p_id: id,
      p_public_url: `https://db.example.invalid/storage/v1/object/public/editorial-public/PH/${id}.png`,
      p_reference: "QA-REF",
    });
  });
  it("refuses without staff second step, a reference, or as the uploader", async () => {
    mocks.staffAccess.mockResolvedValueOnce({
      user: { id: me },
      allowed: true,
      mfa: false,
    });
    expect(
      (await publishMedia({ message: "" }, form({ id, reference: "QA-REF" })))
        .ok,
    ).toBeUndefined();
    expect(
      (await publishMedia({ message: "" }, form({ id, reference: " x " }))).ok,
    ).toBeUndefined();
    mocks.asset.mockResolvedValueOnce({
      data: { ...asset, uploaded_by: me },
      error: null,
    });
    expect(
      (await publishMedia({ message: "" }, form({ id, reference: "QA-REF" })))
        .message,
    ).toMatch(/Ask another/);
    mocks.asset.mockResolvedValueOnce({
      data: { ...asset, storage_provider: "r2" },
      error: null,
    });
    expect(
      (await publishMedia({ message: "" }, form({ id, reference: "QA-REF" })))
        .message,
    ).toMatch(/Only Supabase/);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("removes the public copy when the database refuses", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Media publication access denied" },
    });
    const result = await publishMedia(
      { message: "" },
      form({ id, reference: "QA-REF" }),
    );
    expect(result.ok).toBeUndefined();
    expect(result.message).toMatch(/other than the uploader/);
    expect(mocks.remove).toHaveBeenCalledWith([`PH/${id}.png`]);
  });
});

describe("unpublishMedia", () => {
  it("unpublishes in the database first, then removes the public file", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: `PH/${id}.png`, error: null });
    const result = await unpublishMedia({ message: "" }, form({ id }));
    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("unpublish_media_asset", {
      p_id: id,
    });
    expect(mocks.remove).toHaveBeenCalledWith([`PH/${id}.png`]);
    expect(mocks.buckets).toContain("editorial-public");
  });
  it("keeps the file when the database refuses (image still in use)", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "P0001",
        message: "Remove this image from content in review or published first",
      },
    });
    const result = await unpublishMedia({ message: "" }, form({ id }));
    expect(result.message).toMatch(/Remove this image/);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
