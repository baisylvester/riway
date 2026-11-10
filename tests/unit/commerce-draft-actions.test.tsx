import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("NOT_FOUND");
  },
}));
vi.mock("@/components/commerce-draft-form", () => ({
  CommerceDraftForm: () => createElement("div", { "data-draft-form": true }),
}));
import { saveCommerceDraft } from "../../src/app/admin/commerce-actions";
import { CommerceDraftsPanel } from "../../src/components/commerce-drafts-panel";
const user = "72000000-0000-4000-8000-000000000001",
  product = "72000000-0000-4000-8000-000000000002",
  id = "72000000-0000-4000-8000-000000000003";
function form(kind = "package") {
  const value = new FormData();
  for (const [name, entry] of Object.entries({
    kind,
    draftId: "",
    market: "PH",
    name: "Proposed configuration",
    status: "draft",
    expectedRevision: "0",
    componentCount: "1",
    componentProduct_0: product,
    componentQuantity_0: "2",
    retailAmount: "0.29",
    memberAmount: "",
    discountType: "percent",
    discountAmount: "12.34",
    minimumSubtotal: "100.00",
    maximumDiscount: "",
    voucherCode: " draft-code ",
    startsAt: "2027-01-01T00:00",
    endsAt: "2027-02-01T00:00",
    audience: "all",
    usageLimit: "",
  }))
    value.set(name, entry);
  value.append("productIds", product);
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  f.access.mockResolvedValue({ user: { id: user }, allowed: true, mfa: true });
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  f.session.mockResolvedValue({
    user: { id: user },
    client: { rpc: f.rpc, from: vi.fn(() => query) },
  });
  f.rpc.mockImplementation(
    async (_name: string, args: Record<string, any>) => ({
      data: {
        id: args.draft_id ?? id,
        kind: args.k,
        market: args.m,
        currency: "PHP",
        name: args.n,
        status: args.s,
        definition: args.d,
        revision: args.expected_revision + 1,
        createdBy: user,
        updatedBy: user,
        createdAt: "2026-11-10T00:00:00Z",
        updatedAt: "2026-11-10T00:00:00Z",
      },
      error: null,
    }),
  );
});
describe("commerce draft server actions", () => {
  it("retains a newly saved draft identity when a later edit fails", async () => {
    const saved = await saveCommerceDraft({ message: "" }, form());
    expect(saved.ok).toBe(true);
    const edit = form();
    edit.set("draftId", saved.saved!.id);
    edit.set("expectedRevision", String(saved.saved!.revision));
    f.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const failed = await saveCommerceDraft(saved, edit);
    expect(failed.saved?.id).toBe(saved.saved!.id);
    expect(failed.saved?.revision).toBe(1);
    expect(failed.ok).not.toBe(true);
  });
  it("requires staff MFA before any database write", async () => {
    for (const access of [
      { allowed: false, mfa: true },
      { allowed: true, mfa: false },
    ]) {
      f.access.mockResolvedValue(access);
      expect((await saveCommerceDraft({ message: "" }, form())).ok).not.toBe(
        true,
      );
    }
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("converts exact decimal prices, preserves null planned prices and sends no forged actor metadata", async () => {
    const input = form();
    input.set("createdBy", "forged");
    const result = await saveCommerceDraft({ message: "" }, input);
    expect(result.ok).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("save_commerce_draft", {
      draft_id: null,
      k: "package",
      m: "PH",
      n: "Proposed configuration",
      s: "draft",
      d: {
        components: [{ productId: product, quantity: 2 }],
        retailMinor: 29,
        memberMinor: null,
      },
      expected_revision: 0,
    });
    expect(f.revalidate).toHaveBeenCalledWith("/admin/packages");
    expect(f.revalidate).not.toHaveBeenCalledWith("/shop");
  });
  it("normalizes vouchers, UTC windows and percentage basis points without floating-point rounding", async () => {
    expect(
      (await saveCommerceDraft({ message: "" }, form("promotion"))).ok,
    ).toBe(true);
    expect(f.rpc.mock.calls[0][1].d).toMatchObject({
      discountValue: 1234,
      minimumSubtotalMinor: 10000,
      voucherCode: "DRAFT-CODE",
      startsAt: "2027-01-01T00:00:00.000Z",
      usageLimit: null,
    });
  });
  it("rejects malformed amounts, revision conflicts in input and invalid promotion windows before RPC", async () => {
    for (const [key, value] of [
      ["retailAmount", "1e2"],
      ["retailAmount", "0.001"],
      ["expectedRevision", "2"],
      ["componentCount", "31"],
    ]) {
      const input = form();
      input.set(key, value);
      expect((await saveCommerceDraft({ message: "" }, input)).ok).not.toBe(
        true,
      );
    }
    const input = form("promotion");
    input.set("endsAt", "2026-01-01T00:00");
    expect((await saveCommerceDraft({ message: "" }, input)).ok).not.toBe(true);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("makes stale saves and missing setup actionable without exposing database errors", async () => {
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "internal fixture" },
    });
    expect(
      (await saveCommerceDraft({ message: "" }, form())).message,
    ).toContain("newer version");
    f.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(
      (await saveCommerceDraft({ message: "" }, form())).message,
    ).toContain("setup");
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("rejects a save response for a different market or version", async () => {
    f.rpc.mockResolvedValue({ data: {}, error: null });
    expect((await saveCommerceDraft({ message: "" }, form())).ok).not.toBe(
      true,
    );
  });
});
describe("commerce draft management page", () => {
  it("does not query private draft data before staff MFA", async () => {
    f.access.mockResolvedValue({
      user: { id: user },
      allowed: true,
      mfa: false,
    });
    expect(
      await CommerceDraftsPanel({ kind: "package", query: {} }),
    ).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("distinguishes missing setup and denied financial-role access from an empty list", async () => {
    for (const [code, text] of [
      ["PGRST202", "Configuration setup is pending"],
      ["42501", "compliance access is required"],
    ]) {
      f.rpc.mockResolvedValue({ data: null, error: { code } });
      const html = renderToStaticMarkup(
        await CommerceDraftsPanel({ kind: "package", query: {} }),
      );
      expect(html).toContain(text);
      expect(html).not.toContain("No drafts on this page");
    }
  });
  it("renders a verified empty list and rejects unscoped or malformed edit selection", async () => {
    f.rpc.mockResolvedValue({
      data: { drafts: [], markets: ["PH"], hasMore: false, page: 1 },
      error: null,
    });
    const html = renderToStaticMarkup(
      await CommerceDraftsPanel({ kind: "package", query: {} }),
    );
    expect(html).toContain("No drafts on this page");
    expect(html).toContain("/admin/packages?edit=new");
    await expect(
      CommerceDraftsPanel({ kind: "package", query: { edit: id } }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
