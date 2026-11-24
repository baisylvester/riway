import { describe, expect, it } from "vitest";
import { jsonLdScript, productJsonLd } from "@/lib/structured-data";
import {
  legacyRedirects,
  nextRedirects,
  validateLegacyRedirects,
} from "@/lib/legacy-redirects";
import type { Offer, Product } from "@/lib/domain";

const product: Product = {
  id: "4f8a2c10-1111-4222-8333-444455556666",
  slug: "sample-product",
  name: "Sample product",
  category: "Nutrition",
  subtitle: "Sample subtitle",
  description: "Sample description",
  image_url: "/images/sample.webp",
  status: "published",
};
const offer: Offer = {
  product_id: product.id,
  market: "PH",
  retail_minor: 125050,
  member_minor: null,
  currency: "PHP",
  regulatory_approved: true,
  approval_reference: "REF",
  max_quantity: 6,
};
const open = { online_sales_approved: true, payments_ready: true };

describe("product JSON-LD", () => {
  it("describes the product with absolute URLs and no invented facts", () => {
    const data = productJsonLd({
      product,
      offer: undefined,
      market: null,
      origin: "https://shop.example.invalid",
    });
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Sample product",
      description: "Sample description",
      image: ["https://shop.example.invalid/images/sample.webp"],
      brand: { "@type": "Brand", name: "RIWAY" },
      url: "https://shop.example.invalid/shop/sample-product",
    });
    expect(JSON.stringify(data)).not.toMatch(
      /aggregateRating|review|availability/,
    );
  });

  it("includes a price only while that product is genuinely on sale", () => {
    const base = { product, origin: "https://shop.example.invalid" };
    expect(productJsonLd({ ...base, offer, market: open })).toMatchObject({
      offers: { "@type": "Offer", priceCurrency: "PHP", price: "1250.50" },
    });
    for (const [o, m] of [
      [offer, { ...open, online_sales_approved: false }],
      [offer, { ...open, payments_ready: false }],
      [{ ...offer, regulatory_approved: false }, open],
      [{ ...offer, retail_minor: null }, open],
      [undefined, open],
    ] as const)
      expect(
        productJsonLd({ ...base, offer: o, market: m }),
      ).not.toHaveProperty("offers");
  });

  it("serialises without allowing script breakout", () => {
    const out = jsonLdScript({
      name: "</script><script>alert(1)</script> & co",
    });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out).name).toBe(
      "</script><script>alert(1)</script> & co",
    );
  });
});

describe("legacy redirect map", () => {
  it("ships empty until RIWAY supplies the URL inventory, and is valid", () => {
    expect(legacyRedirects).toEqual([]);
    expect(nextRedirects()).toEqual([]);
  });

  it("produces permanent same-site redirects", () => {
    expect(
      nextRedirects([{ source: "/products/purtier", destination: "/purtier" }]),
    ).toEqual([
      { source: "/products/purtier", destination: "/purtier", permanent: true },
    ]);
  });

  it("rejects open redirects, app-route overlaps, duplicates, loops and chains", () => {
    const cases = [
      { source: "/old", destination: "https://evil.example" },
      { source: "/old", destination: "//evil.example" },
      { source: "/admin/old", destination: "/shop" },
      { source: "/api/x", destination: "/shop" },
      { source: "/old?x=1", destination: "/shop" },
      { source: "old", destination: "/shop" },
      { source: "/shop", destination: "/shop/" },
    ];
    for (const c of cases) expect(validateLegacyRedirects([c])).not.toEqual([]);
    expect(
      validateLegacyRedirects([
        { source: "/a", destination: "/shop" },
        { source: "/A/", destination: "/about" },
      ]),
    ).toContain("Duplicate source: /A/");
    expect(
      validateLegacyRedirects([
        { source: "/a", destination: "/b" },
        { source: "/b", destination: "/shop" },
      ]),
    ).toContain("Redirect chain through /b");
    expect(() =>
      nextRedirects([{ source: "/old", destination: "https://evil.example" }]),
    ).toThrow("Invalid legacy redirects");
  });
});
