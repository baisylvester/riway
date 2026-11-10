import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { Market, Product } from "../../src/lib/domain";

const mocks = vi.hoisted(() => ({
  catalogue: vi.fn(),
  currentMarket: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/data", () => mocks);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));
vi.mock("../../src/components/brand/reference-shell", () => ({
  ReferenceShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../src/components/brand/reference-stage", () => ({
  ReferenceStage: ({ kind }: { kind: string }) =>
    createElement("div", { "data-stage": kind }),
}));

import Purtier, {
  generateMetadata as purtierMetadata,
} from "../../src/app/purtier/page";
import Conscientious, {
  generateMetadata as conscientiousMetadata,
} from "../../src/app/conscientious/page";
import { ProductComplianceNotice } from "../../src/components/product-compliance-notice";

const presentations = [
  { slug: "purtier-placenta", page: Purtier, metadata: purtierMetadata },
  {
    slug: "conscientious",
    page: Conscientious,
    metadata: conscientiousMetadata,
  },
];

function product(slug: string, status = "published"): Product {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    slug,
    name: `Approved ${slug} collection`,
    category: "Nutrition",
    subtitle: "A reviewed catalogue subtitle",
    description:
      'Approved description with <script>alert("unsafe")</script> as text.',
    image_url: null,
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentMarket.mockResolvedValue("PH");
});

for (const { slug, page, metadata } of presentations) {
  it(`${slug} uses published catalogue copy and escapes it in the presentation`, async () => {
    const entry = product(slug);
    mocks.catalogue.mockResolvedValue({ products: [entry], offers: [] });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain(`<h1 class="display h-l">${entry.name}</h1>`);
    expect(html).toContain(entry.subtitle);
    expect(html).toContain("Approved description with &lt;script&gt;");
    expect(html).not.toContain('<script>alert("unsafe")</script>');
    expect(html).toContain(`href="/shop/${slug}"`);
    expect(html).toContain('id="product-information"');
    expect(html).toContain('data-product-compliance="PH"');
    expect(html).toContain("No approved therapeutic claims.");
    expect(await metadata()).toEqual({
      title: `${entry.name} · RIWAY`,
      description: `Explore ${entry.name} presentation and packaging. Contact RIWAY for approved product information for your market.`,
    });
  });

  for (const status of ["draft", "review", "archived", "missing"]) {
    it(`${slug} does not expose ${status} catalogue content through page or metadata`, async () => {
      mocks.catalogue.mockResolvedValue({
        products: status === "missing" ? [] : [product(slug, status)],
        offers: [],
      });
      await expect(page()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
      await expect(metadata()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    });
  }

  it(`${slug} presents packaging without legacy benefit, dosage or ingredient claims`, async () => {
    mocks.catalogue.mockResolvedValue({
      products: [product(slug)],
      offers: [],
    });
    const html = renderToStaticMarkup(await page());
    expect(html).not.toMatch(
      /restorative powers|Supports healthy circulation|Immune defences|100 mg|fourteen ingredients|27 patented|Spray five to eight|repair skin damage|Regulates excessive sebum|highest absorption|does not sell products via any website/i,
    );
    expect(html).toContain('id="hero"');
    expect(html).toContain('id="u3"');
    expect(html).toContain('href="#product-information"');
  });

  it(`${slug} respects the selected market in its approval notice`, async () => {
    mocks.catalogue.mockResolvedValue({
      products: [product(slug)],
      offers: [],
    });
    mocks.currentMarket.mockResolvedValue("SG");
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('data-product-compliance="SG"');
    expect(html).toContain("Product information for Singapore.");
    expect(html).not.toContain("Philippine product approval");
  });
}

it.each([
  ["PH", "Philippines"],
  ["SG", "Singapore"],
  ["MY", "Malaysia"],
] as const)(
  "the shared %s notice communicates pending labels and unavailable sales",
  (market, name) => {
    const html = renderToStaticMarkup(
      createElement(ProductComplianceNotice, { market: market as Market }),
    );
    expect(html).toContain(`Product information for ${name}.`);
    expect(html).toContain("awaiting RIWAY’s approved content");
    expect(html).toContain("Online purchasing is");
    expect(html).toContain("unavailable while market approval");
    expect(html.includes("No approved therapeutic claims.")).toBe(
      market === "PH",
    );
  },
);
