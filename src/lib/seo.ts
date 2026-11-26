import type { MetadataRoute } from "next";
import { configuredSiteUrl } from "./site-url";
import { locales, localizedHref, localizedSeoLocales } from "./locales";

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
    return new URL(configuredSiteUrl(env) || "").origin;
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

// English is canonical without a prefix. Other complete translated pages must
// be explicitly reviewed before sitemap/hreflang publication.
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
  env: Record<string, string | undefined> = process.env,
): MetadataRoute.Sitemap {
  const entry = (
    path: string,
    lastModified?: string | null,
  ): MetadataRoute.Sitemap => {
    const url = path === "/" ? origin : `${origin}${path}`;
    const languages: Record<string, string> = { "x-default": url };
    const approved = localizedSeoLocales(path, env);
    for (const lang of approved)
      languages[lang] = new URL(localizedHref(path, lang), origin).href;
    return approved.map((locale) => ({
      url:
        locale === "en"
          ? url
          : new URL(localizedHref(path, locale), origin).href,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages },
    }));
  };
  const slugs = (prefix: string, items: Slugged[] = []) => {
    const seen = new Set<string>();
    return items
      .filter((i) => i.slug && !seen.has(i.slug) && seen.add(i.slug))
      .flatMap((i) =>
        entry(`${prefix}/${encodeURIComponent(i.slug)}`, i.updated_at),
      );
  };
  return [
    ...staticPublicPaths.flatMap((p) => entry(p)),
    ...legalSlugs.flatMap((s) => entry(`/legal/${s}`)),
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
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        ...privateRobotsPaths,
        ...locales
          .filter((l) => l !== "en")
          .flatMap((l) => privateRobotsPaths.map((path) => `/${l}${path}`)),
      ],
    },
    sitemap: `${siteOrigin(env)}/sitemap.xml`,
  };
}
