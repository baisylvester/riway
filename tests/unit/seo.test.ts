import { describe, expect, it } from "vitest";
import {
  robotsRules,
  searchIndexingEnabled,
  siteOrigin,
  sitemapEntries,
} from "../../src/lib/seo";

const origin = "https://riway.example";

describe("search indexing gate", () => {
  it("stays hidden unless explicitly enabled", () => {
    expect(searchIndexingEnabled({})).toBe(false);
    expect(searchIndexingEnabled({ SEARCH_INDEXING: "true" })).toBe(false);
    expect(searchIndexingEnabled({ SEARCH_INDEXING: "enabled" })).toBe(true);
    expect(robotsRules({})).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
  });

  it("opens public pages, keeps private ones out, and names the sitemap", () => {
    const robots = robotsRules({
      SEARCH_INDEXING: "enabled",
      NEXT_PUBLIC_SITE_URL: `${origin}/`,
    });
    expect(robots.sitemap).toBe(`${origin}/sitemap.xml`);
    const rules = robots.rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    for (const path of ["/admin", "/account", "/api/", "/checkout", "/d/"])
      expect(rules.disallow).toContain(path);
  });

  it("falls back to a local origin when the site URL is missing", () => {
    expect(siteOrigin({})).toBe("http://localhost:4173");
  });
});

describe("sitemap", () => {
  const entries = sitemapEntries(origin, {
    products: [
      { slug: "purtier-placenta", updated_at: "2026-11-01T00:00:00Z" },
      { slug: "purtier-placenta" },
    ],
    stories: [
      { slug: "global", market: null },
      { slug: "ph-only", market: "PH" },
      { slug: "sg-only", market: "SG" },
    ],
    events: [{ slug: "launch day" }],
  });
  const urls = entries.map((e) => e.url);

  it("lists public pages and published content once each", () => {
    expect(urls).toContain(origin);
    expect(urls).toContain(`${origin}/shop`);
    expect(urls).toContain(`${origin}/legal/privacy`);
    expect(
      urls.filter((u) => u.endsWith("/shop/purtier-placenta")),
    ).toHaveLength(1);
    expect(urls).toContain(`${origin}/events/launch%20day`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("only lists stories a cookieless crawler can open", () => {
    expect(urls).toContain(`${origin}/stories/global`);
    expect(urls).toContain(`${origin}/stories/ph-only`);
    expect(urls).not.toContain(`${origin}/stories/sg-only`);
  });

  it("never lists private or personal pages", () => {
    for (const path of [
      "/admin",
      "/account",
      "/checkout",
      "/cart",
      "/d/",
      "/auth",
    ])
      expect(urls.some((u) => u.startsWith(`${origin}${path}`))).toBe(false);
  });

  it("carries hreflang alternates for English and x-default", () => {
    const shop = entries.find((e) => e.url === `${origin}/shop`);
    expect(shop?.alternates?.languages).toEqual({
      en: `${origin}/shop`,
      "x-default": `${origin}/shop`,
    });
    const product = entries.find((e) => e.url.endsWith("/purtier-placenta"));
    expect(product?.lastModified).toBe("2026-11-01T00:00:00Z");
  });
});
