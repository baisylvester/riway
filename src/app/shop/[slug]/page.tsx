import Link from "next/link";
import { notFound } from "next/navigation";
import {
  catalogue,
  currentMarket,
  packageCompositions,
  productRecommendations,
} from "@/lib/data";
import { packagesContaining, pairsWith } from "@/lib/recommendations";
import { ProductSuggestions } from "@/components/product-suggestions";
import { money, markets } from "@/lib/domain";
import { ProductArt } from "@/components/product-card";
import { ProductEditorial } from "@/components/brand/editorial";
import { AddToBag } from "@/components/add-to-bag";
import { ProductComplianceNotice } from "@/components/product-compliance-notice";
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { products, offers } = await catalogue();
  const p = products.find((p) => p.slug === slug);
  if (!p) notFound();
  const market = await currentMarket();
  // A package page needs its composition; elsewhere compositions only feed
  // optional suggestions, so a lookup failure just hides them.
  const compositions =
    p.category === "Packages"
      ? await packageCompositions(market)
      : await packageCompositions(market).catch(() => []);
  const composition =
    p.category === "Packages"
      ? compositions.find((item) => item.productId === p.id)
      : undefined;
  const rows = await productRecommendations(p.id);
  const pairs = pairsWith(p.id, rows, products, offers, market, compositions);
  const packages =
    p.category === "Packages"
      ? []
      : packagesContaining(p.id, compositions, products, offers, market);
  const offer = offers.find(
    (o) => o.product_id === p.id && o.market === market,
  );
  return (
    <>
      <section
        className="section page-section rw-product-review"
        id="product-review"
      >
        <div className="breadcrumbs">
          <Link href="/shop">Our collections</Link> / {p.name}
        </div>
        <div className="product-detail">
          <div className={`product-art detail-art ${slug}`}>
            <ProductArt product={p} />
          </div>
          <div>
            <span className="eyebrow">
              {p.category} · {markets[market].name}
            </span>
            <h1>{p.name}</h1>
            <p className="lead">{p.subtitle}</p>
            <p>{p.description}</p>
            <div className="price">
              {money(offer?.retail_minor ?? null, markets[market].currency)}
            </div>
            <ProductComplianceNotice market={market} />
            {composition && (
              <div className="panel">
                <h2>In this package</h2>
                <ul>
                  {composition.components.map((item) => (
                    <li key={item.productId}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.category !== "Packages" || composition ? (
              <AddToBag id={p.id} />
            ) : (
              <p className="notice">
                This package is awaiting an approved configuration for your
                market.
              </p>
            )}
            {(slug === "purtier-placenta" || slug === "conscientious") && (
              <a className="rw-product-story-link" href="#collection-story">
                Explore the presentation & packaging ↓
              </a>
            )}
            <details>
              <summary>Product information</summary>
              <p>
                Ingredients, directions and label information are awaiting
                RIWAY’s approved market-specific content. Contact RIWAY for
                official product information.
              </p>
            </details>
            <details>
              <summary>Delivery & returns</summary>
              <p>
                Shipping options and return terms will be published when
                approved for this market. No orders or payments are currently
                accepted.
              </p>
            </details>
          </div>
        </div>
      </section>
      <ProductSuggestions
        productName={p.name}
        packages={packages}
        pairs={pairs}
      />
      <div id="collection-story">
        <ProductEditorial slug={slug} href="#product-review" />
      </div>
    </>
  );
}
