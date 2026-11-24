import type { Offer, Product } from "./domain";

// Product JSON-LD (audit G24). Only facts the site already publishes are used:
// name, description, image, brand and URL. An Offer (price) is included only
// while that exact product can genuinely be bought online in the market:
// market sales approved, payments ready, product registered and an approved
// price set. No ratings, reviews, availability or health claims are invented.

export type MarketGate = {
  online_sales_approved: boolean;
  payments_ready: boolean;
};

export function productJsonLd(input: {
  product: Product;
  offer: Offer | undefined;
  market: MarketGate | null;
  origin: string;
}) {
  const { product, offer, market, origin } = input;
  const url = new URL(`/shop/${product.slug}`, origin).href;
  const image = product.image_url
    ? new URL(product.image_url, origin).href
    : undefined;
  const sellable =
    !!market?.online_sales_approved &&
    !!market.payments_ready &&
    !!offer?.regulatory_approved &&
    Number.isInteger(offer.retail_minor) &&
    (offer.retail_minor ?? 0) > 0;
  const description = (product.description || product.subtitle || "").trim();
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(description ? { description: description.slice(0, 5000) } : {}),
    ...(image ? { image: [image] } : {}),
    brand: { "@type": "Brand", name: "RIWAY" },
    url,
    ...(sellable
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: offer!.currency,
            price: (offer!.retail_minor! / 100).toFixed(2),
          },
        }
      : {}),
  };
}

// Characters that could end the script element or break older parsers are
// written as JSON unicode escapes; JSON.parse restores them unchanged.
const unsafeJsonLd = new Set([
  "<",
  ">",
  "&",
  String.fromCharCode(0x2028),
  String.fromCharCode(0x2029),
]);

/** Serialises JSON-LD safely for an inline script element. */
export function jsonLdScript(data: unknown) {
  let out = "";
  for (const char of JSON.stringify(data))
    out += unsafeJsonLd.has(char)
      ? "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")
      : char;
  return out;
}
