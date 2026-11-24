import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
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
import { TrackViewItem } from "@/components/commerce-tracking";
import { jsonLdScript, productJsonLd } from "@/lib/structured-data";
import { siteOrigin } from "@/lib/seo";
import { db } from "@/lib/supabase/server";
import { ProductComplianceNotice } from "@/components/product-compliance-notice";
import { ProductContentPanel } from "@/components/product-content-panel";
// One catalogue read per request, shared by the title and the page.
const loadCatalogue = cache(catalogue);
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = (await loadCatalogue()).products.find((p) => p.slug === slug);
  return p ? { title: p.name, description: p.subtitle || undefined } : {};
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { products, offers } = await loadCatalogue();
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
  // Price appears in structured data only while online sales are open.
  const gate = await (async () => {
    try {
      const r = await (
        await db()
      )
        .from("markets")
        .select("online_sales_approved,payments_ready")
        .eq("code", market)
        .maybeSingle();
      return r.error ? null : r.data;
    } catch {
      return null;
    }
  })();
  const structured = productJsonLd({
    product: p,
    offer,
    market: gate,
    origin: siteOrigin(),
  });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structured) }}
      />
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
            <TrackViewItem
              currency={markets[market].currency}
              item={{
                id: p.id,
                name: p.name,
                quantity: 1,
                priceMinor: offer?.retail_minor ?? null,
              }}
            />
            <p className="lead">{p.subtitle}</p>
            <p>{p.description}</p>
            <div className="price">
              {money(offer?.retail_minor ?? null, markets[market].currency)}
            </div>
            <ProductComplianceNotice market={market} />
            <ProductContentPanel productId={p.id} market={market} />
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
              <AddToBag
                id={p.id}
                track={{
                  currency: markets[market].currency,
                  name: p.name,
                  priceMinor: offer?.retail_minor ?? null,
                }}
              />
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
