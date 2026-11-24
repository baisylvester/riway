import type { MetadataRoute } from "next";

// Search indexing stays off until RIWAY approves launch. Setting
// SEARCH_INDEXING=enabled opens public pages to crawlers and publishes the
// sitemap location in robots.txt; any other value keeps the site hidden.
export function searchIndexingEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.SEARCH_INDEXING === "enabled";
}

export function siteOrigin(
  env: Record<string, string | undefined> = process.env,
) {
  try {
    return new URL(env.NEXT_PUBLIC_SITE_URL || "").origin;
  } catch {
    return "http://localhost:4173";
  }
}

// Public pages that are the same for every visitor. Personal, transactional
// and staff pages (account, admin, cart, checkout, auth, distributor links)
// are deliberately left out.
export const staticPublicPaths = [
  "/",
  "/about",
  "/shop",
  "/membership",
  "/stories",
  "/events",
  "/support",
  "/legal",
  "/purtier",
  "/conscientious",
  "/find-a-distributor",
] as const;

export const legalSlugs = [
  "privacy",
  "terms",
  "cookies",
  "conduct",
  "disclaimers",
] as const;

export const privateRobotsPaths = [
  "/account",
  "/admin",
  "/api/",
  "/auth/",
  "/cart",
  "/checkout",
  "/d/",
  "/distributor",
  "/membership/demo",
  "/operations",
];

// The site is English-only and the PH/SG/MY market is chosen by cookie on
// the same URL, so each page has a single language version. hreflang therefore
// lists English plus x-default; add one entry per locale once localized URLs
// exist (proposal §4.2).
export const siteLanguages = ["en"] as const;

type Slugged = {
  slug: string;
  updated_at?: string | null;
  market?: string | null;
};

// Crawlers send no market cookie, so they see the default market (PH).
// Market-specific stories and events for other markets would 404 for them.
export function crawlerVisible<T extends Slugged>(
  items: T[],
  defaultMarket = "PH",
) {
  return items.filter((i) => !i.market || i.market === defaultMarket);
}

export function sitemapEntries(
  origin: string,
  dynamic: { products?: Slugged[]; stories?: Slugged[]; events?: Slugged[] },
): MetadataRoute.Sitemap {
  const entry = (
    path: string,
    lastModified?: string | null,
  ): MetadataRoute.Sitemap[number] => {
    const url = path === "/" ? origin : `${origin}${path}`;
    const languages: Record<string, string> = { "x-default": url };
    for (const lang of siteLanguages) languages[lang] = url;
    return {
      url,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    };
  };
  const slugs = (prefix: string, items: Slugged[] = []) => {
    const seen = new Set<string>();
    return items
      .filter((i) => i.slug && !seen.has(i.slug) && seen.add(i.slug))
      .map((i) =>
        entry(`${prefix}/${encodeURIComponent(i.slug)}`, i.updated_at),
      );
  };
  return [
    ...staticPublicPaths.map((p) => entry(p)),
    ...legalSlugs.map((s) => entry(`/legal/${s}`)),
    ...slugs("/shop", dynamic.products),
    ...slugs("/stories", crawlerVisible(dynamic.stories ?? [])),
    ...slugs("/events", crawlerVisible(dynamic.events ?? [])),
  ];
}

export function robotsRules(
  env: Record<string, string | undefined> = process.env,
): MetadataRoute.Robots {
  if (!searchIndexingEnabled(env)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: privateRobotsPaths },
    sitemap: `${siteOrigin(env)}/sitemap.xml`,
  };
}
