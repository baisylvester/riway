import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogue, currentMarket } from "@/lib/data";
import { money, markets } from "@/lib/domain";
import { ProductArt } from "@/components/product-card";
import { AddToBag } from "@/components/add-to-bag";
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
  const offer = offers.find(
    (o) => o.product_id === p.id && o.market === market,
  );
  return (
    <section className="section page-section">
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
          <div className="notice">
            Online purchasing unavailable. Market approval, official pricing and
            approved product labels must be verified before sales open.
            {market === "PH" &&
              " Philippine product approval is pending according to the project brief. No approved therapeutic claims. Read the label and consult a healthcare professional."}
          </div>
          <AddToBag id={p.id} />
          <details>
            <summary>Product information</summary>
            <p>
              Ingredients, directions and label information are awaiting RIWAY’s
              approved market-specific content. Contact RIWAY for official
              product information.
            </p>
          </details>
          <details>
            <summary>Delivery & returns</summary>
            <p>
              Shipping options and return terms will be published when approved
              for this market. No orders or payments are currently accepted.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
