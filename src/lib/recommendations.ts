import { z } from "zod";
import type { Market, Offer, Product } from "./domain";

export const maxRecommendations = 4;

export const recommendationRowSchema = z.object({
  product_id: z.uuid(),
  recommended_id: z.uuid(),
  position: z.number().int().min(0).max(3),
});
export type RecommendationRow = z.infer<typeof recommendationRowSchema>;

type Composition = {
  productId: string;
  components: { productId: string; name: string; quantity: number }[];
};

export type Suggestion = { product: Product; offer: Offer };

const offerFor = (offers: Offer[], productId: string, market: Market) =>
  offers.find(
    (o) =>
      o.product_id === productId &&
      o.market === market &&
      o.regulatory_approved &&
      o.retail_minor !== null,
  );

/**
 * Staff-curated cross-sell for one product, in the order staff chose. Only
 * published products with an approved price in the visitor's market are shown;
 * packages also need an approved composition there.
 */
export function pairsWith(
  productId: string,
  rows: RecommendationRow[],
  products: Product[],
  offers: Offer[],
  market: Market,
  compositions: Composition[],
): Suggestion[] {
  return rows
    .filter((r) => r.product_id === productId && r.recommended_id !== productId)
    .sort((a, b) => a.position - b.position)
    .flatMap((r) => {
      const product = products.find(
        (p) => p.id === r.recommended_id && p.status === "published",
      );
      const offer = product && offerFor(offers, product.id, market);
      if (!product || !offer) return [];
      if (
        product.category === "Packages" &&
        !compositions.some((c) => c.productId === product.id)
      )
        return [];
      return [{ product, offer }];
    })
    .slice(0, maxRecommendations);
}

/**
 * Upsell: approved packages in this market that contain the product, with the
 * quantity included. Packages are never suggested for themselves.
 */
export function packagesContaining(
  productId: string,
  compositions: Composition[],
  products: Product[],
  offers: Offer[],
  market: Market,
) {
  return compositions
    .filter((c) => c.productId !== productId)
    .flatMap((c) => {
      const component = c.components.find((i) => i.productId === productId);
      const product = products.find(
        (p) => p.id === c.productId && p.status === "published",
      );
      const offer = product && offerFor(offers, product.id, market);
      if (!component || !product || !offer) return [];
      return [{ product, offer, quantity: component.quantity }];
    })
    .sort(
      (a, b) =>
        (a.offer.retail_minor ?? 0) - (b.offer.retail_minor ?? 0) ||
        a.product.name.localeCompare(b.product.name),
    )
    .slice(0, maxRecommendations);
}

/** Admin form values to an ordered, de-duplicated list without the product itself. */
export const recommendationRequestSchema = z
  .object({
    productId: z.uuid(),
    picks: z.array(z.union([z.uuid(), z.literal("")])).max(maxRecommendations),
  })
  .transform(({ productId, picks }) => ({
    productId,
    picks: picks.filter((p): p is string => p !== ""),
  }))
  .refine((v) => new Set(v.picks).size === v.picks.length, {
    message: "Each recommended product can be chosen once.",
  })
  .refine((v) => !v.picks.includes(v.productId), {
    message: "A product cannot recommend itself.",
  });
