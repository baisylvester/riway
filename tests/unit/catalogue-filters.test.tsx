import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Product } from "../../src/lib/domain";

const mocks = vi.hoisted(() => ({
  catalogue: vi.fn(),
  currentMarket: vi.fn(),
}));
vi.mock("../../src/lib/data", () => mocks);
vi.mock("../../src/components/product-card", () => ({
  ProductCard: ({ product }: { product: Product }) => <h3>{product.name}</h3>,
}));
import Shop from "../../src/app/shop/page";

beforeEach(() => {
  mocks.currentMarket.mockResolvedValue("PH");
  mocks.catalogue.mockResolvedValue({
    products: [
      {
        id: "73000000-0000-4000-8000-000000000001",
        name: "PURTIER PLACENTA",
        subtitle: "Signature collection",
        category: "Nutrition",
      },
      {
        id: "73000000-0000-4000-8000-000000000002",
        name: "CONSCIENTIOUS",
        subtitle: "Considered care",
        category: "Skincare",
      },
    ],
  });
});
const render = async (
  query: Awaited<Parameters<typeof Shop>[0]["searchParams"]>,
) => renderToStaticMarkup(await Shop({ searchParams: Promise.resolve(query) }));

it("uses the first repeated search value without crashing", async () => {
  const html = await render({ q: ["purtier", "conscientious"] });
  expect(html).toContain("<h3>PURTIER PLACENTA</h3>");
  expect(html).not.toContain("<h3>CONSCIENTIOUS</h3>");
  expect(html).toContain('value="purtier"');
  expect(html).toContain("1 collection");
});
it("uses the first repeated collection consistently in results and select", async () => {
  const html = await render({ category: ["Skincare", "Nutrition"] });
  expect(html).toContain('<option selected="">Skincare</option>');
  expect(html).toContain("<h3>CONSCIENTIOUS</h3>");
  expect(html).not.toContain("<h3>PURTIER PLACENTA</h3>");
});
it.each(["unknown", "__proto__", "", undefined])(
  "defaults unsupported collection %s to All",
  async (category) => {
    const html = await render({ category });
    expect(html).toContain('<option selected="">All</option>');
    expect(html).toContain("2 collections");
  },
);
it("trims surrounding search whitespace and keeps case-insensitive matching", async () => {
  const html = await render({ q: "  PURTIER  " });
  expect(html).toContain("<h3>PURTIER PLACENTA</h3>");
  expect(html).toContain('value="PURTIER"');
  expect(html).toContain("1 collection");
});
it("keeps empty/repeated-empty inputs and combined empty results safe", async () => {
  expect(await render({ q: [], category: [] })).toContain("2 collections");
  const html = await render({ q: "conscientious", category: "Nutrition" });
  expect(html).toContain("No matching collections");
  expect(html).toContain("0 collections");
});
