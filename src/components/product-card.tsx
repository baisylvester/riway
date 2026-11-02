import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "@/lib/domain";
export function ProductArt({
  product,
  hero = false,
}: {
  product: Pick<Product, "slug" | "name">;
  hero?: boolean;
}) {
  return product.slug === "purtier-placenta" ? (
    <Image
      className={hero ? "hero-bottle" : "bottle"}
      src="/images/purtier.png"
      width={404}
      height={800}
      alt="PURTIER PLACENTA product bottle"
      priority={hero}
    />
  ) : product.slug === "conscientious" ? (
    <Image
      className="product-photo"
      src="/images/conscientious.jpg"
      width={980}
      height={551}
      alt="CONSCIENTIOUS collection"
    />
  ) : (
    <span className="eyebrow">{product.name}</span>
  );
}
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link className="product-card" href={`/shop/${product.slug}`}>
      <div className={`product-art ${product.slug}`}>
        <span className="product-tag">{product.category}</span>
        <ProductArt product={product} />
        <span className="circle-link">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <div className="product-title">
        <h3>{product.name}</h3>
        <span>
          Explore collection <ArrowUpRight size={14} />
        </span>
      </div>
      <p>{product.subtitle}</p>
    </Link>
  );
}
