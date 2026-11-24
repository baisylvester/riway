import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staffAccess: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  storage: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  staffAccess: mocks.staffAccess,
  session: mocks.session,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const { reviewPhoto } = await import("@/app/admin/distributors/photo-actions");
const submission = {
  id: "70000000-0000-4000-8000-000000000001",
  market: "PH",
  objectPath:
    "80000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001.png",
};
const publishedUrl =
  "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/distributor-photos/PH/90000000-0000-4000-8000-000000000002.png";
function form(overrides: Record<string, string> = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({
    ...submission,
    decision: "approve",
    reference: "QA-REF",
    note: "",
    ...overrides,
  }))
    f.set(key, value);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.staffAccess.mockResolvedValue({
    user: { id: "staff" },
    allowed: true,
    mfa: true,
  });
  mocks.session.mockResolvedValue({
    client: { rpc: mocks.rpc, storage: { from: mocks.storage } },
  });
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "staff_photo_submissions"
      ? { data: [submission], error: null }
      : { data: null, error: null },
  );
  mocks.storage.mockReturnValue({
    download: mocks.download,
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
  });
  mocks.download.mockResolvedValue({
    data: new Blob(["fixture"], { type: "image/png" }),
    error: null,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: publishedUrl } });
});
describe("photo review authorizes before publishing", () => {
  it.each([
    ["own, stale or out-of-market submission", { data: [], error: null }],
    ["unavailable queue", { data: null, error: { code: "42501" } }],
    ["malformed queue", { data: [{}], error: null }],
  ])(
    "refuses %s without touching storage or recording a review",
    async (_, queue) => {
      mocks.rpc.mockResolvedValueOnce(queue);
      expect((await reviewPhoto({ message: "" }, form())).ok).toBeUndefined();
      expect(mocks.storage).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
  it.each<Record<string, string>>([
    { id: "70000000-0000-4000-8000-000000000002" },
    { market: "SG" },
    {
      objectPath:
        "80000000-0000-4000-8000-000000000002/90000000-0000-4000-8000-000000000001.png",
    },
  ])(
    "refuses forged submission fields %j before uploading",
    async (overrides) => {
      expect(
        (await reviewPhoto({ message: "" }, form(overrides))).ok,
      ).toBeUndefined();
      expect(mocks.storage).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("publishes an authorized submission and records its approval", async () => {
    expect((await reviewPhoto({ message: "" }, form())).ok).toBe(true);
    expect(mocks.download).toHaveBeenCalledWith(submission.objectPath);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^PH\/[0-9a-f-]+\.png$/),
      expect.any(Blob),
      { contentType: "image/png", upsert: false },
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("review_distributor_photo", {
      p_id: submission.id,
      p_approve: true,
      p_public_url: publishedUrl,
      p_reference: "QA-REF",
      p_note: null,
    });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.download.mock.invocationCallOrder[0],
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/distributors");
  });
  it("rejects an authorized submission without storage access", async () => {
    expect(
      (
        await reviewPhoto(
          { message: "" },
          form({ decision: "reject", reference: "", note: "Resubmit" }),
        )
      ).ok,
    ).toBe(true);
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith("review_distributor_photo", {
      p_id: submission.id,
      p_approve: false,
      p_public_url: null,
      p_reference: null,
      p_note: "Resubmit",
    });
  });
  it("refuses rejection of a submission absent from the review queue", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(
      (await reviewPhoto({ message: "" }, form({ decision: "reject" }))).ok,
    ).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("requires staff verification before loading the queue", async () => {
    mocks.staffAccess.mockResolvedValueOnce({
      user: { id: "staff" },
      allowed: true,
      mfa: false,
    });
    expect((await reviewPhoto({ message: "" }, form())).ok).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("requires an approval reference before publishing", async () => {
    expect(
      (await reviewPhoto({ message: "" }, form({ reference: "" }))).ok,
    ).toBeUndefined();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
