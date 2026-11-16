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
import {
  commerceOfferSchema,
  commerceOfferListSchema,
} from "../../src/lib/commerce-offers";
import {
  approveCommerceDraft,
  withdrawCommerceOffer,
} from "../../src/app/admin/commerce-offer-actions";
import { CommerceDraftsPanel } from "../../src/components/commerce-drafts-panel";
import { CommerceApprovalForm } from "../../src/components/commerce-approval-form";

const user = "74000000-0000-4000-8000-000000000001",
  draftId = "74000000-0000-4000-8000-000000000002",
  productId = "74000000-0000-4000-8000-000000000003",
  offerId = "74000000-0000-4000-8000-000000000004",
  componentId = "74000000-0000-4000-8000-000000000005";
const timestamp = "2026-11-10T10:00:00.123456+00:00";
const packageDefinition = {
  components: [{ productId: componentId, quantity: 3 }],
  retailMinor: 30000,
  memberMinor: null,
};
const promotionDefinition = {
  productIds: [componentId],
  discountType: "percent" as const,
  discountValue: 1250,
  minimumSubtotalMinor: 10000,
  maximumDiscountMinor: null,
  voucherCode: "REVIEW-ONLY",
  startsAt: "2027-01-01T00:00:00Z",
  endsAt: "2027-02-01T00:00:00Z",
  audience: "all" as const,
  usageLimit: 10,
};
const draft = () => ({
  id: draftId,
  kind: "package" as const,
  market: "PH" as const,
  currency: "PHP" as const,
  name: "Reviewed package",
  status: "review" as const,
  definition: packageDefinition,
  revision: 3,
  createdBy: user,
  updatedBy: user,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const offer = () => ({
  id: offerId,
  kind: "package" as const,
  market: "PH" as const,
  currency: "PHP" as const,
  name: "Reviewed package",
  draftId,
  draftRevision: 3,
  productId,
  approvalReference: "APPROVAL-FIXTURE",
  approvedBy: user,
  approvedAt: timestamp,
  withdrawnAt: null as string | null,
  definition: packageDefinition,
  contractVersion: 1 as const,
});
const products = [
  {
    id: productId,
    slug: "package-fixture",
    name: "Package product",
    category: "Packages",
    status: "published",
    subtitle: "",
    description: "",
    image_url: null,
  },
  {
    id: componentId,
    slug: "component-fixture",
    name: "Component product",
    category: "Nutrition",
    status: "published",
    subtitle: "",
    description: "",
    image_url: null,
  },
];
function approvalForm(kind = "package") {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    kind,
    market: "PH",
    draftId,
    revision: "3",
    productId,
    reference: " APPROVAL-FIXTURE ",
    acknowledged: "on",
  }))
    form.set(name, value);
  return form;
}
function withdrawalForm() {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    offerId,
    kind: "package",
    market: "PH",
    reference: "Withdraw fixture version",
    acknowledged: "on",
  }))
    form.set(name, value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  f.access.mockResolvedValue({ user: { id: user }, allowed: true, mfa: true });
  f.session.mockResolvedValue({
    user: { id: user },
    client: {
      rpc: f.rpc,
      from: () => ({
        select: () => ({
          order: async () => ({ data: products, error: null }),
        }),
      }),
    },
  });
  f.rpc.mockImplementation(async (name: string) => {
    if (name === "staff_commerce_drafts")
      return {
        data: { drafts: [draft()], markets: ["PH"], hasMore: false, page: 1 },
        error: null,
      };
    if (name === "staff_commerce_offers")
      return {
        data: { offers: [], markets: ["PH"], hasMore: false, page: 1 },
        error: null,
      };
    return {
      data:
        name === "withdraw_commerce_offer"
          ? { ...offer(), withdrawnAt: timestamp }
          : offer(),
      error: null,
    };
  });
});

describe("immutable commerce offer validation", () => {
  it("accepts PostgreSQL timestamps and validates approved package/promotion snapshots", () => {
    expect(commerceOfferSchema.safeParse(offer()).success).toBe(true);
    expect(
      commerceOfferSchema.safeParse({
        ...offer(),
        kind: "promotion",
        productId: null,
        definition: promotionDefinition,
      }).success,
    ).toBe(true);
    for (const invalid of [
      { ...offer(), currency: "SGD" },
      { ...offer(), contractVersion: 2 },
      { ...offer(), definition: { ...packageDefinition, retailMinor: null } },
      { ...offer(), extra: true },
      { ...offer(), kind: "promotion", definition: promotionDefinition },
      {
        ...offer(),
        kind: "promotion",
        productId: null,
        definition: { ...promotionDefinition, voucherCode: null },
      },
    ])
      expect(commerceOfferSchema.safeParse(invalid).success).toBe(false);
  });
  it("rejects cross-market lists, duplicate market scope and malformed pagination", () => {
    expect(
      commerceOfferListSchema.safeParse({
        offers: [offer()],
        markets: ["PH"],
        hasMore: false,
        page: 1,
      }).success,
    ).toBe(true);
    for (const invalid of [
      { offers: [offer()], markets: ["SG"], hasMore: false, page: 1 },
      { offers: [], markets: ["PH", "PH"], hasMore: false, page: 1 },
      { offers: [], markets: ["PH"], hasMore: false, page: 0 },
    ])
      expect(commerceOfferListSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("commerce approval and withdrawal actions", () => {
  it("checks staff MFA and session before any approval or withdrawal RPC", async () => {
    for (const access of [
      { user: null, allowed: true, mfa: true },
      { user: { id: user }, allowed: false, mfa: true },
      { user: { id: user }, allowed: true, mfa: false },
    ]) {
      f.access.mockResolvedValue(access);
      expect(
        (await approveCommerceDraft({ message: "" }, approvalForm())).ok,
      ).not.toBe(true);
      expect(
        (await withdrawCommerceOffer({ message: "" }, withdrawalForm())).ok,
      ).not.toBe(true);
    }
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("requires explicit acknowledgment, valid revision, package selection and reference", async () => {
    for (const [key, value] of [
      ["acknowledged", ""],
      ["reference", "x"],
      ["revision", "0"],
      ["productId", ""],
      ["market", "US"],
    ]) {
      const form = approvalForm();
      form.set(key, value);
      expect((await approveCommerceDraft({ message: "" }, form)).ok).not.toBe(
        true,
      );
    }
    const form = withdrawalForm();
    form.delete("acknowledged");
    expect((await withdrawCommerceOffer({ message: "" }, form)).ok).not.toBe(
      true,
    );
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("submits only the reviewed identity/reference and uses server-owned approval metadata", async () => {
    const form = approvalForm();
    form.set("approvedBy", "forged");
    expect((await approveCommerceDraft({ message: "" }, form)).ok).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("approve_commerce_draft", {
      p_draft: draftId,
      p_revision: 3,
      p_product: productId,
      p_reference: "APPROVAL-FIXTURE",
    });
    expect(f.revalidate).toHaveBeenCalledWith("/admin/packages");
    expect(f.revalidate).toHaveBeenCalledWith("/checkout");
  });
  it("uses a null package mapping for promotions", async () => {
    f.rpc.mockResolvedValue({
      data: {
        ...offer(),
        kind: "promotion",
        productId: null,
        definition: promotionDefinition,
      },
      error: null,
    });
    expect(
      (await approveCommerceDraft({ message: "" }, approvalForm("promotion")))
        .ok,
    ).toBe(true);
    expect(f.rpc.mock.calls[0][1].p_product).toBeNull();
  });
  it("rejects mismatched returned identity, version, market and approval actor", async () => {
    for (const change of [
      { draftRevision: 4 },
      { draftId: componentId },
      { market: "SG", currency: "SGD" },
      { approvedBy: componentId },
      { withdrawnAt: timestamp },
    ]) {
      f.rpc.mockResolvedValue({ data: { ...offer(), ...change }, error: null });
      expect(
        (await approveCommerceDraft({ message: "" }, approvalForm())).ok,
      ).not.toBe(true);
    }
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("returns safe actionable stale, duplicate, permission and setup errors", async () => {
    for (const [code, text] of [
      ["40001", "latest version"],
      ["23505", "already exists"],
      ["42501", "compliance"],
      ["PGRST202", "setup"],
      ["P0001", "could not be changed"],
    ]) {
      f.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "private database fixture details" },
      });
      const result = await approveCommerceDraft(
        { message: "" },
        approvalForm(),
      );
      expect(result.message).toContain(text);
      expect(result.message).not.toContain("private database");
    }
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("withdraws the exact version and verifies the terminal response", async () => {
    expect(
      (await withdrawCommerceOffer({ message: "" }, withdrawalForm())).ok,
    ).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("withdraw_commerce_offer", {
      p_offer: offerId,
      p_reference: "Withdraw fixture version",
    });
    f.rpc.mockResolvedValue({ data: offer(), error: null });
    expect(
      (await withdrawCommerceOffer({ message: "" }, withdrawalForm())).ok,
    ).not.toBe(true);
  });
});

describe("commerce configuration management", () => {
  it("shows the scoped approval form for a reviewed draft and rejects unscoped IDs", async () => {
    const html = renderToStaticMarkup(
      await CommerceDraftsPanel({
        kind: "package",
        query: { approve: draftId },
      }),
    );
    expect(html).toContain("Approve Reviewed package");
    expect(html).toContain("Published package product");
    expect(html).toContain("Approval reference");
    await expect(
      CommerceDraftsPanel({ kind: "package", query: { approve: componentId } }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      CommerceDraftsPanel({
        kind: "package",
        query: { approve: draftId, edit: draftId },
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
  it("keeps approval setup failures distinct from an empty approved history", async () => {
    f.rpc.mockImplementation(async (name: string) =>
      name === "staff_commerce_offers"
        ? { data: null, error: { code: "PGRST202" } }
        : {
            data: {
              drafts: [draft()],
              markets: ["PH"],
              hasMore: false,
              page: 1,
            },
            error: null,
          },
    );
    const html = renderToStaticMarkup(
      await CommerceDraftsPanel({ kind: "package", query: {} }),
    );
    expect(html).toContain("Checkout approval setup is pending");
    expect(html).not.toContain("No approved versions on this page");
    expect(html).not.toContain("Review for checkout approval");
  });
  it("shows immutable approval history and separate pagination with withdrawal controls", async () => {
    f.rpc.mockImplementation(async (name: string, args: { page: number }) => ({
      data:
        name === "staff_commerce_offers"
          ? {
              offers: [
                offer(),
                { ...offer(), id: componentId, withdrawnAt: timestamp },
              ],
              markets: ["PH"],
              hasMore: true,
              page: args.page,
            }
          : {
              drafts: [draft()],
              markets: ["PH"],
              hasMore: false,
              page: args.page,
            },
      error: null,
    }));
    const html = renderToStaticMarkup(
      await CommerceDraftsPanel({
        kind: "package",
        query: { offersPage: "2" },
      }),
    );
    expect(html).toContain("APPROVAL-FIXTURE");
    expect(html).toContain("Withdrawn");
    expect(html).toContain("Confirm withdrawal");
    expect(html).toContain("offersPage=3");
    expect(html).toContain("Approved versions page");
  });
  it("explains promotion semantics and blocks incomplete approval prerequisites", () => {
    const promotionDraft = {
      ...draft(),
      kind: "promotion" as const,
      definition: promotionDefinition,
    };
    const html = renderToStaticMarkup(
      <CommerceApprovalForm draft={promotionDraft} products={products} />,
    );
    expect(html).toContain("One voucher applies per order");
    expect(html).toContain("eligible products");
    expect(html).toContain("Vouchers are not combined");
    expect(html).toContain("12.50%");
    expect(html).toContain("Component product");
    expect(html).toContain("Total redemption limit");
    const incomplete = renderToStaticMarkup(
      <CommerceApprovalForm
        draft={{ ...draft(), status: "draft" }}
        products={products}
      />,
    );
    expect(incomplete).toContain("Mark the draft ready for review first");
    expect(incomplete).toContain("disabled");
  });
});
