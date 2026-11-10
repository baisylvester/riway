import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Product } from "../../src/lib/domain";
import { ReferencePurtier } from "../../src/components/brand/reference-products-purtier";
import { ReferenceConscientious } from "../../src/components/brand/reference-products-conscientious";

const product: Product = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "purtier-placenta",
  name: "Reviewed collection",
  category: "Nutrition",
  subtitle: "Reviewed subtitle",
  description: "Reviewed product description.",
  image_url: null,
  status: "published",
};

for (const [brand, Component] of [
  ["PURTIER", ReferencePurtier],
  ["CONSCIENTIOUS", ReferenceConscientious],
] as const) {
  it(`${brand} footer links resolve to actual product-page sections`, () => {
    // Render the real shell/footer together with its presentation so removing a
    // claim section cannot silently leave a dead footer link behind.
    const html = renderToStaticMarkup(
      <Component product={product} market="PH" />,
    );
    const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
    expect(footer).toBeDefined();
    const targets = [...footer!.matchAll(/href="#([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(targets).toContain("product-information");
    for (const target of targets) expect(html).toContain(`id="${target}"`);
    expect(footer).toContain("Online purchasing is unavailable");
    expect(footer).not.toMatch(
      /Optimal care|Revolutionary|does not sell products via any website|strictly prohibited from selling/i,
    );
  });
}
