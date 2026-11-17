import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));

import { saveRecommendations } from "../../src/app/admin/actions";
import { ProductSuggestions } from "../../src/components/product-suggestions";
import type { Offer, Product } from "../../src/lib/domain";
import {
  packagesContaining,
  pairsWith,
  recommendationRequestSchema,
} from "../../src/lib/recommendations";

const id = (n: number) => `79000000-0000-4000-8000-00000000000${n}`;
const product = (n: number, over: Partial<Product> = {}): Product => ({
  id: id(n),
  slug: `product-${n}`,
  name: `Product ${n}`,
  category: "Nutrition",
  subtitle: "",
  description: "",
  image_url: null,
  status: "published",
  ...over,
});
const offer = (n: number, over: Partial<Offer> = {}): Offer =>
  ({
    product_id: id(n),
    market: "PH",
    retail_minor: n * 1000,
    member_minor: null,
    currency: "PHP",
    regulatory_approved: true,
    approval_reference: "QA",
    max_quantity: 24,
    ...over,
  }) as Offer;

const products = [
  product(1),
  product(2),
  product(3, { status: "draft" }),
  product(4),
  product(5, { category: "Packages", name: "Starter package" }),
  product(6, { category: "Packages", name: "Family package" }),
];
const offers = [
  offer(1),
  offer(2),
  offer(3),
  offer(4, { market: "SG", currency: "SGD" }),
  offer(5),
  offer(6),
];
const compositions = [
  {
    productId: id(5),
    components: [{ productId: id(1), name: "Product 1", quantity: 2 }],
  },
  {
    productId: id(6),
    components: [{ productId: id(1), name: "Product 1", quantity: 6 }],
  },
];
const row = (to: number, position: number) => ({
  product_id: id(1),
  recommended_id: id(to),
  position,
});

describe("pairsWith", () => {
  it("keeps staff order and drops unpublished, unpriced or self picks", () => {
    const result = pairsWith(
      id(1),
      [row(4, 0), row(2, 2), row(3, 1), row(1, 3)],
      products,
      offers,
      "PH",
      compositions,
    );
    expect(result.map((s) => s.product.id)).toEqual([id(2)]);
  });

  it("shows a package only when it has an approved composition", () => {
    expect(
      pairsWith(id(1), [row(5, 0)], products, offers, "PH", []).length,
    ).toBe(0);
    expect(
      pairsWith(id(1), [row(5, 0)], products, offers, "PH", compositions)[0]
        .product.id,
    ).toBe(id(5));
  });
});

describe("packagesContaining", () => {
  it("lists approved packages that include the product, cheapest first", () => {
    const result = packagesContaining(
      id(1),
      compositions,
      products,
      offers,
      "PH",
    );
    expect(result.map((p) => [p.product.name, p.quantity])).toEqual([
      ["Starter package", 2],
      ["Family package", 6],
    ]);
    expect(
      packagesContaining(id(2), compositions, products, offers, "PH"),
    ).toEqual([]);
    expect(
      packagesContaining(id(1), compositions, products, offers, "SG"),
    ).toEqual([]);
  });
});

describe("recommendation request", () => {
  it("drops empty slots and refuses duplicates or self picks", () => {
    expect(
      recommendationRequestSchema.parse({
        productId: id(1),
        picks: ["", id(2), ""],
      }).picks,
    ).toEqual([id(2)]);
    expect(
      recommendationRequestSchema.safeParse({
        productId: id(1),
        picks: [id(2), id(2)],
      }).success,
    ).toBe(false);
    expect(
      recommendationRequestSchema.safeParse({
        productId: id(1),
        picks: [id(1)],
      }).success,
    ).toBe(false);
    expect(
      recommendationRequestSchema.safeParse({
        productId: id(1),
        picks: [id(2), id(3), id(4), id(5), id(6)],
      }).success,
    ).toBe(false);
  });
});

describe("saveRecommendations action", () => {
  const form = (picks: string[]) => {
    const data = new FormData();
    data.set("productId", id(1));
    for (const pick of picks) data.append("pick", pick);
    return data;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    f.access.mockResolvedValue({ allowed: true, mfa: true });
    f.session.mockResolvedValue({ client: { rpc: f.rpc } });
    f.rpc.mockResolvedValue({ data: [id(2)], error: null });
  });

  it("saves the ordered list through the RPC", async () => {
    const result = await saveRecommendations(
      { message: "" },
      form([id(2), "", id(4), ""]),
    );
    expect(result.ok).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("set_product_recommendations", {
      p_product: id(1),
      p_recommended: [id(2), id(4)],
    });
    expect(f.revalidate).toHaveBeenCalledWith("/shop/[slug]", "page");
  });

  it("requires staff MFA and maps refusals", async () => {
    f.access.mockResolvedValueOnce({ allowed: true, mfa: false });
    expect(
      (await saveRecommendations({ message: "" }, form([id(2)]))).message,
    ).toMatch(/MFA/);
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const denied = await saveRecommendations({ message: "" }, form([id(2)]));
    expect(denied.ok).toBeUndefined();
    expect(denied.message).toMatch(/editor or compliance/);
  });
});

describe("ProductSuggestions", () => {
  it("renders nothing without suggestions", () => {
    expect(
      renderToStaticMarkup(
        <ProductSuggestions productName="Product 1" packages={[]} pairs={[]} />,
      ),
    ).toBe("");
  });

  it("shows package upsell with price and cross-sell cards", () => {
    const html = renderToStaticMarkup(
      <ProductSuggestions
        productName="Product 1"
        packages={packagesContaining(
          id(1),
          compositions,
          products,
          offers,
          "PH",
        )}
        pairs={pairsWith(
          id(1),
          [row(2, 0)],
          products,
          offers,
          "PH",
          compositions,
        )}
      />,
    );
    expect(html).toContain("Also in a package");
    expect(html).toContain("includes 2 × Product 1");
    expect(html).toContain("₱50.00");
    expect(html).toContain("Pairs well with");
    expect(html).toContain('href="/shop/product-2"');
  });
});
