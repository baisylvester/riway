import type { Market, Product } from "@/lib/domain";
import { ProductComplianceNotice } from "@/components/product-compliance-notice";

export function ReferenceProductInformation({
  product,
  market,
}: {
  product: Product;
  market: Market;
}) {
  return (
    <section className="section hairline" id="product-information">
      <div className="two">
        <div>
          <span className="k">Product information · {product.category}</span>
          <h2 className="display h-m" style={{ marginTop: 12 }}>
            {product.subtitle || product.name}
          </h2>
          <p className="lede" style={{ marginTop: 22, whiteSpace: "pre-line" }}>
            {product.description}
          </p>
          <a
            className="btn magnetic"
            href={`/shop/${product.slug}`}
            style={{ marginTop: 26 }}
          >
            Product details & review bag
          </a>
        </div>
        <ProductComplianceNotice market={market} />
      </div>
    </section>
  );
}
