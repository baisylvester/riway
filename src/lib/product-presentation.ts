import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogue, currentMarket } from "./data";

// Both the presentation and its metadata respect the catalogue publication
// workflow. A saved draft must never remain visible through a brand route.
export const productPresentation = cache(async (slug: string) => {
  const [{ products }, market] = await Promise.all([
    catalogue(),
    currentMarket(),
  ]);
  const product = products.find(
    (item) => item.slug === slug && item.status === "published",
  );
  if (!product) notFound();
  return { product, market };
});

export async function productPresentationMetadata(
  slug: string,
): Promise<Metadata> {
  const { product } = await productPresentation(slug);
  return {
    title: `${product.name} · RIWAY`,
    description: `Explore ${product.name} presentation and packaging. Contact RIWAY for approved product information for your market.`,
  };
}
