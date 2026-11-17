import type { MetadataRoute } from "next";
import { catalogue, content } from "@/lib/data";
import { siteOrigin, sitemapEntries } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A content outage should shrink the sitemap to the fixed pages, not make
  // it fail for crawlers.
  const [catalog, stories, events] = await Promise.all([
    catalogue().catch(() => ({ products: [] })),
    content("story").catch(() => []),
    content("event").catch(() => []),
  ]);
  return sitemapEntries(siteOrigin(), {
    products: catalog.products,
    stories: stories ?? [],
    events: events ?? [],
  });
}
