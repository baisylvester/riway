import { describe, it, expect } from "vitest";
import {
  asMarket,
  cartSchema,
  checkoutSchema,
  eligibility,
  mergeCart,
  type Offer,
} from "../../src/lib/domain";
import {
  DisabledPaymentAdapter,
  DisabledMemberAdapter,
} from "../../src/services/integrations";
const id = "ef17d8a1-3f32-4e15-8a92-65014637ea96";
describe("market and regulatory enforcement", () => {
  const offer: Offer = {
    product_id: id,
    market: "PH",
    retail_minor: 10000,
    member_minor: 9000,
    currency: "PHP",
    regulatory_approved: true,
    approval_reference: "verified-ref",
    max_quantity: 6,
  };
  it("defaults invalid markets to the blocked Philippine market", () => {
    expect(asMarket("US")).toBe("PH");
    expect(asMarket("SG")).toBe("SG");
  });
  it("requires corporate policy approval even with an approved product", () =>
    expect(eligibility(offer, false, true).allowed).toBe(false));
  it("requires documentary registration evidence", () =>
    expect(
      eligibility({ ...offer, approval_reference: null }, true, true).allowed,
    ).toBe(false));
  it("rejects missing pricing or unavailable payments", () => {
    expect(
      eligibility({ ...offer, retail_minor: null }, true, true).allowed,
    ).toBe(false);
    expect(eligibility(offer, true, false).allowed).toBe(false);
  });
  it("accepts eligibility only with all prerequisites", () =>
    expect(eligibility(offer, true, true).allowed).toBe(true));
});
describe("bag integrity", () => {
  it("merges existing selections and caps quantities", () => {
    expect(mergeCart([{ productId: id, quantity: 23 }], id, 4)).toEqual([
      { productId: id, quantity: 24 },
    ]);
  });
  it("rejects negative, fractional and excessive quantities", () => {
    for (const quantity of [-1, 0, 1.5, 100])
      expect(cartSchema.safeParse([{ productId: id, quantity }]).success).toBe(
        false,
      );
  });
  it("rejects unknown product identifiers", () =>
    expect(
      cartSchema.safeParse([{ productId: "fake", quantity: 1 }]).success,
    ).toBe(false));
});
describe("checkout validation", () => {
  const payload = {
    market: "PH",
    items: [{ productId: id, quantity: 1 }],
    address: {
      full_name: "Test Person",
      phone: "123456789",
      line1: "10 Test Street",
      city: "Manila",
      postal_code: "1000",
      country: "PH",
    },
    terms: true,
    idempotencyKey: id,
  };
  it("validates delivery country against market", () => {
    expect(checkoutSchema.safeParse(payload).success).toBe(true);
    expect(
      checkoutSchema.safeParse({
        ...payload,
        address: { ...payload.address, country: "SG" },
      }).success,
    ).toBe(false);
  });
  it("requires explicit terms acceptance and a nonempty bag", () => {
    expect(checkoutSchema.safeParse({ ...payload, terms: false }).success).toBe(
      false,
    );
    expect(checkoutSchema.safeParse({ ...payload, items: [] }).success).toBe(
      false,
    );
  });
});
describe("external dependencies fail closed", () => {
  it("never simulates a successful payment or verified webhook", async () => {
    const a = new DisabledPaymentAdapter();
    await expect(a.createSession()).rejects.toThrow("awaiting");
    await expect(a.verifyWebhook()).rejects.toThrow("awaiting");
  });
  it("never invents a sponsor or compensation result", async () => {
    const a = new DisabledMemberAdapter();
    await expect(a.validateSponsor()).rejects.toThrow("awaiting");
    await expect(a.submitOrder()).rejects.toThrow("awaiting");
  });
});
