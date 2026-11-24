import { describe, expect, it } from "vitest";
import {
  cycleRequestSchema,
  distributorDashboardSchema,
  materialRequestSchema,
  photoRequestSchema,
} from "@/lib/distributor-dashboard";

describe("distributor dashboard contract", () => {
  const valid = {
    code: "QA-1",
    market: "PH",
    orders: [
      {
        reference: "3F8A2C10",
        placedAt: "2026-11-24T01:00:00+00:00",
        market: "PH",
        status: "paid",
        currency: "PHP",
        totalMinor: 200,
        customer: "Customer A1B2C3",
        units: 2,
      },
    ],
    customers: [
      {
        customer: "Customer A1B2C3",
        firstOrderAt: "2026-11-24",
        lastOrderAt: "2026-11-24",
        paidOrders: 1,
        expectedReorderOn: "2027-01-23",
      },
    ],
    materials: [],
  };
  it("accepts pseudonymous summaries", () => {
    expect(distributorDashboardSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a response that carries a real customer identifier", () => {
    const leaked = {
      ...valid,
      orders: [{ ...valid.orders[0], customer: "Jane Customer" }],
    };
    expect(distributorDashboardSchema.safeParse(leaked).success).toBe(false);
  });
});

describe("staff distributor tool inputs", () => {
  it("only allows approved material and photo locations", () => {
    const material = {
      market: "ALL",
      title: "Sample brochure",
      description: "",
      url: "/images/brochure.pdf",
      reference: "QA-REF",
      published: "on",
    };
    expect(materialRequestSchema.parse(material)).toMatchObject({
      market: null,
      published: true,
    });
    for (const url of [
      "https://evil.example/x",
      "javascript:alert(1)",
      "//evil.example",
    ])
      expect(
        materialRequestSchema.safeParse({ ...material, url }).success,
      ).toBe(false);
    expect(
      photoRequestSchema.safeParse({
        code: "QA-1",
        url: "/images/me.webp",
        reference: "R",
      }).success,
    ).toBe(true);
    expect(
      photoRequestSchema.safeParse({
        code: "QA-1",
        url: "https://evil.example/me.webp",
        reference: "R",
      }).success,
    ).toBe(false);
  });
  it("bounds reorder cycles and allows clearing", () => {
    const id = "4f8a2c10-1111-4222-8333-444455556666";
    expect(
      cycleRequestSchema.parse({ productId: id, days: "", reference: "" }).days,
    ).toBeNull();
    expect(
      cycleRequestSchema.parse({ productId: id, days: "30", reference: "R" })
        .days,
    ).toBe(30);
    for (const days of ["3", "400", "7.5", "abc"])
      expect(
        cycleRequestSchema.safeParse({ productId: id, days, reference: "R" })
          .success,
      ).toBe(false);
  });
});
