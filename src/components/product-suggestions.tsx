import Link from "next/link";
import { money } from "@/lib/domain";
import type { Suggestion } from "@/lib/recommendations";
import { ProductCard } from "./product-card";

type PackageSuggestion = Suggestion & { quantity: number };

// Upsell to approved packages and staff-curated cross-sell. Renders nothing
// when there is nothing approved to suggest in this market.
export function ProductSuggestions({
  productName,
  packages,
  pairs,
}: {
  productName: string;
  packages: PackageSuggestion[];
  pairs: Suggestion[];
}) {
  if (!packages.length && !pairs.length) return null;
  return (
    <section className="section page-section stack" aria-label="Suggestions">
      {packages.length > 0 && (
        <div className="panel stack">
          <h2>Also in a package</h2>
          <p className="muted">
            Approved packages in your market that include {productName}.
          </p>
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
            {packages.map(({ product, offer, quantity }) => (
              <li key={product.id} className="order-row">
                <Link href={`/shop/${product.slug}`}>
                  {product.name}
                  <small>
                    {" "}
                    · includes {quantity} × {productName}
                  </small>
                </Link>
                <span>{money(offer.retail_minor, offer.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pairs.length > 0 && (
        <>
          <h2>Pairs well with</h2>
          <div className="products-grid">
            {pairs.map(({ product }) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
