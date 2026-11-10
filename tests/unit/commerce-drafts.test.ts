import { describe, expect, it } from "vitest";
import {
  commerceDraftInputSchema,
  commerceDraftListSchema,
  commerceDraftRecordSchema,
} from "../../src/lib/commerce-drafts";

const first = "aabbccdd-eeee-4fff-8aaa-bbbbbbbbbbbb";
const second = "11111111-2222-4333-8444-555555555555";
const base = {
  draftId: null,
  market: "PH",
  name: "  Proposed collection  ",
  status: "draft",
  expectedRevision: 0,
};
const components = [{ productId: first, quantity: 1 }];
const packageInput = (definition: Record<string, unknown> = {}) => ({
  ...base,
  kind: "package",
  definition: {
    components,
    retailMinor: null,
    memberMinor: null,
    ...definition,
  },
});
const promotionInput = (definition: Record<string, unknown> = {}) => ({
  ...base,
  kind: "promotion",
  definition: {
    productIds: [first],
    discountType: "percent",
    discountValue: 1000,
    minimumSubtotalMinor: 0,
    maximumDiscountMinor: null,
    voucherCode: null,
    startsAt: "2026-11-10T08:00:00Z",
    endsAt: "2026-11-11T08:00:00.000Z",
    audience: "all",
    usageLimit: null,
    ...definition,
  },
});
const parseable = (value: unknown) =>
  commerceDraftInputSchema.safeParse(value).success;

describe("commerce draft authoring contract", () => {
  it("accepts unpriced package planning and trims its name without inventing prices", () => {
    const result = commerceDraftInputSchema.parse(packageInput());
    expect(result.name).toBe("Proposed collection");
    expect(result.definition).toEqual({
      components,
      retailMinor: null,
      memberMinor: null,
    });
    expect(
      parseable(
        packageInput({
          components: [{ productId: first, quantity: 1000 }],
          retailMinor: 1,
          memberMinor: 100000000,
        }),
      ),
    ).toBe(true);
  });

  it("rejects empty, duplicate and malformed package components, including UUID case variants", () => {
    for (const value of [
      [],
      [components[0], components[0]],
      [components[0], { productId: first.toUpperCase(), quantity: 2 }],
      [{ productId: "not-a-product", quantity: 1 }],
      [{ productId: first, quantity: 1, approved: true }],
    ])
      expect(parseable(packageInput({ components: value }))).toBe(false);
    for (const quantity of [0, -1, 1.5, 1001, "1", null]) {
      expect(
        parseable(
          packageInput({ components: [{ productId: first, quantity }] }),
        ),
      ).toBe(false);
    }
  });

  it("caps component and promotion target counts while permitting 30 distinct products", () => {
    const ids = Array.from(
      { length: 31 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    expect(
      parseable(
        packageInput({
          components: ids
            .slice(0, 30)
            .map((productId) => ({ productId, quantity: 1 })),
        }),
      ),
    ).toBe(true);
    expect(
      parseable(
        packageInput({
          components: ids.map((productId) => ({ productId, quantity: 1 })),
        }),
      ),
    ).toBe(false);
    expect(parseable(promotionInput({ productIds: ids.slice(0, 30) }))).toBe(
      true,
    );
    expect(parseable(promotionInput({ productIds: ids }))).toBe(false);
  });

  it("requires explicit nullable prices and rejects coercion or invalid monetary amounts", () => {
    for (const price of [0, -1, 1.5, 100000001, "100", undefined]) {
      expect(parseable(packageInput({ retailMinor: price }))).toBe(false);
      expect(parseable(packageInput({ memberMinor: price }))).toBe(false);
    }
  });

  it("separates initial creation from versioned edits", () => {
    expect(
      parseable({ ...packageInput(), draftId: first, expectedRevision: 1 }),
    ).toBe(true);
    for (const input of [
      { ...packageInput(), expectedRevision: 1 },
      { ...packageInput(), draftId: first },
      { ...packageInput(), expectedRevision: -1 },
      { ...packageInput(), draftId: first, expectedRevision: 1.5 },
      { ...packageInput(), draftId: first, expectedRevision: 2147483648 },
    ])
      expect(parseable(input)).toBe(false);
  });

  it("does not accept activation states or submitted server-owned metadata", () => {
    for (const status of ["active", "published", "approved", ""]) {
      expect(parseable({ ...packageInput(), status })).toBe(false);
    }
    for (const field of [
      "createdBy",
      "updatedBy",
      "createdAt",
      "revision",
      "currency",
    ]) {
      expect(parseable({ ...packageInput(), [field]: first })).toBe(false);
    }
    expect(parseable(packageInput({ currency: "PHP" }))).toBe(false);
    expect(parseable({ ...packageInput(), market: "US" })).toBe(false);
    expect(parseable({ ...packageInput(), name: " a " })).toBe(false);
    expect(parseable({ ...packageInput(), name: "x".repeat(121) })).toBe(false);
  });

  it("accepts explicit percentage and fixed discounts with independent nullable controls", () => {
    expect(
      parseable(
        promotionInput({
          discountValue: 10000,
          maximumDiscountMinor: 1500,
          voucherCode: "REVIEW-2026",
          usageLimit: 1000000,
        }),
      ),
    ).toBe(true);
    expect(
      parseable(
        promotionInput({
          discountType: "fixed",
          discountValue: 100000000,
          audience: "member",
          minimumSubtotalMinor: 100000000,
        }),
      ),
    ).toBe(true);
  });

  it("rejects out-of-range percentages and mismatched fixed-discount caps", () => {
    expect(parseable(promotionInput({ discountValue: 10001 }))).toBe(false);
    expect(
      parseable(
        promotionInput({ discountType: "fixed", maximumDiscountMinor: 1 }),
      ),
    ).toBe(false);
    for (const discountValue of [0, -1, 1.5, "1000", 100000001]) {
      expect(parseable(promotionInput({ discountValue }))).toBe(false);
    }
    for (const minimumSubtotalMinor of [-1, 0.5, 100000001]) {
      expect(parseable(promotionInput({ minimumSubtotalMinor }))).toBe(false);
    }
  });

  it("requires distinct valid targets and normalized voucher codes", () => {
    for (const productIds of [
      [],
      [first, first],
      [first, first.toUpperCase()],
      ["fake"],
    ]) {
      expect(parseable(promotionInput({ productIds }))).toBe(false);
    }
    for (const voucherCode of [
      "ab",
      "lowercase",
      " CODE",
      "CODE ",
      "A".repeat(41),
    ]) {
      expect(parseable(promotionInput({ voucherCode }))).toBe(false);
    }
    expect(
      parseable(
        promotionInput({
          productIds: [first, second],
          voucherCode: "A".repeat(40),
        }),
      ),
    ).toBe(true);
    for (const usageLimit of [0, -1, 1.5, 1000001]) {
      expect(parseable(promotionInput({ usageLimit }))).toBe(false);
    }
  });

  it("rejects impossible or non-UTC authoring dates and enforces the supported year range", () => {
    for (const startsAt of [
      "1899-12-31T00:00:00Z",
      "2101-01-01T00:00:00Z",
      "1900-02-29T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-11-10T24:00:00Z",
      "2026-11-10T08:00:60Z",
      "2026-11-10T08:00Z",
      "2026-11-10T08:00:00",
      "2026-11-10T08:00:00+00:00",
      "2026-11-10T08:00:00.0000Z",
    ])
      expect(parseable(promotionInput({ startsAt }))).toBe(false);
    expect(
      parseable(promotionInput({ startsAt: "2000-02-29T00:00:00.1Z" })),
    ).toBe(true);
    expect(
      parseable(
        promotionInput({
          startsAt: "1900-01-01T00:00:00Z",
          endsAt: "2100-12-31T23:59:59.999Z",
        }),
      ),
    ).toBe(true);
  });

  it("requires a positive time window and rejects unsupported promotion rules", () => {
    const start = promotionInput().definition.startsAt;
    expect(parseable(promotionInput({ endsAt: start }))).toBe(false);
    expect(parseable(promotionInput({ endsAt: "2026-11-09T00:00:00Z" }))).toBe(
      false,
    );
    expect(parseable(promotionInput({ discountType: "bonus-bottle" }))).toBe(
      false,
    );
    expect(parseable(promotionInput({ stackable: true }))).toBe(false);
  });
});

const record = () => ({
  id: first,
  kind: "package",
  market: "PH",
  currency: "PHP",
  name: "Proposed collection",
  status: "review",
  definition: packageInput().definition,
  revision: 1,
  createdBy: first,
  updatedBy: second,
  createdAt: "2026-11-10T07:41:25.123456+00:00",
  updatedAt: "2026-11-10T15:41:25.123+08:00",
});

describe("commerce draft RPC result contracts", () => {
  it("accepts PostgreSQL server timestamps and validates returned currency against its market", () => {
    expect(commerceDraftRecordSchema.safeParse(record()).success).toBe(true);
    expect(
      commerceDraftRecordSchema.safeParse({ ...record(), currency: "SGD" })
        .success,
    ).toBe(false);
    expect(
      commerceDraftRecordSchema.safeParse({
        ...record(),
        market: "SG",
        currency: "SGD",
      }).success,
    ).toBe(true);
  });

  it("rejects unexpected result fields, missing actors, invalid timestamps and unrecognized states", () => {
    for (const invalid of [
      { ...record(), active: true },
      { ...record(), revision: 0 },
      { ...record(), createdBy: null },
      { ...record(), updatedBy: "unknown" },
      { ...record(), status: "published" },
      { ...record(), definition: {} },
      { ...record(), createdAt: "2026-02-30T00:00:00Z" },
      { ...record(), updatedAt: "2026-11-10T00:00:00" },
    ])
      expect(commerceDraftRecordSchema.safeParse(invalid).success).toBe(false);
  });

  it("bounds lists and prevents mismatched market results from being rendered", () => {
    const list = {
      drafts: [record()],
      markets: ["PH"],
      hasMore: false,
      page: 1,
    };
    expect(commerceDraftListSchema.safeParse(list).success).toBe(true);
    expect(
      commerceDraftListSchema.safeParse({
        drafts: [],
        markets: [],
        hasMore: false,
        page: 1000,
      }).success,
    ).toBe(true);
    for (const invalid of [
      { ...list, markets: ["SG"] },
      { ...list, markets: ["PH", "PH"] },
      { ...list, markets: ["PH", "SG", "MY", "US"] },
      { ...list, page: 0 },
      { ...list, page: 1001 },
      { ...list, page: 1.5 },
      { ...list, hasMore: "false" },
      { ...list, extra: true },
      { ...list, drafts: Array.from({ length: 51 }, record) },
    ])
      expect(commerceDraftListSchema.safeParse(invalid).success).toBe(false);
  });
});
