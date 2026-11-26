import type { Market } from "./domain";

export const locales = ["en", "fil", "ms", "zh-CN"] as const;
export type Locale = (typeof locales)[number];
export const localeNames: Record<Locale, string> = {
  en: "English",
  fil: "Filipino",
  ms: "Bahasa Melayu",
  "zh-CN": "简体中文",
};
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}
// English remains the production default. Draft UI translations must be
// explicitly reviewed and enabled for each market; this never approves claims.
export function enabledLocales(
  market: Market,
  env: Record<string, string | undefined> = process.env,
): Locale[] {
  if (
    !env.UI_TRANSLATION_APPROVAL_REFERENCE?.trim() ||
    env.UI_TRANSLATION_APPROVAL_REFERENCE.trim().length < 5
  )
    return ["en"];
  const requested = (env[`UI_LOCALES_${market}`] ?? "en")
    .split(",")
    .map((v) => v.trim());
  return locales.filter(
    (locale) => locale === "en" || requested.includes(locale),
  );
}
export function splitLocalePath(path: string): {
  locale: Locale;
  path: string;
  prefixed: boolean;
} {
  const boundary = path.search(/[?#]/),
    pathname = boundary < 0 ? path : path.slice(0, boundary),
    suffix = boundary < 0 ? "" : path.slice(boundary);
  const first = pathname.split("/")[1];
  const locale = locales.find((l) => l.toLowerCase() === first?.toLowerCase());
  return locale
    ? {
        locale,
        path: (pathname.slice(first.length + 1) || "/") + suffix,
        prefixed: true,
      }
    : { locale: "en", path, prefixed: false };
}
const pageRoots = new Set([
  "about",
  "shop",
  "membership",
  "stories",
  "events",
  "support",
  "legal",
  "purtier",
  "conscientious",
  "find-a-distributor",
  "cart",
  "checkout",
  "account",
  "d",
  "materials",
  "reference",
]);
export function localizablePath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u001f]/.test(path) ||
    /%(?:2f|5c|00)/i.test(pathname)
  )
    return false;
  if (pathname.split("/").some((p) => p === "." || p === "..")) return false;
  return (
    pathname === "/" ||
    pageRoots.has(pathname.split("/")[1]) ||
    /^\/auth\/(login|register|reset|update-password)\/?$/.test(pathname)
  );
}
export function localizedHref(href: string, locale: Locale) {
  const route = splitLocalePath(href);
  if (!localizablePath(route.path)) return href;
  return locale === "en"
    ? route.path
    : `/${locale}${route.path === "/" ? "" : route.path.startsWith("/?") || route.path.startsWith("/#") ? route.path.slice(1) : route.path}`;
}
export function localizedSeoLocales(
  path: string,
  env: Record<string, string | undefined> = process.env,
): Locale[] {
  // A UI translation alone does not certify that an entire content page has
  // an approved translation. Only explicitly reviewed complete pages get SEO.
  const allowed = enabledLocales("PH", env);
  try {
    const raw = env.LOCALIZED_SEO_PATHS ?? "{}";
    if (raw.length > 100000) return ["en"];
    const pages = JSON.parse(raw);
    return allowed.filter(
      (l) =>
        l === "en" ||
        (Array.isArray(pages?.[l]) &&
          pages[l].length <= 1000 &&
          pages[l].includes(path) &&
          localizablePath(path) &&
          !/[?#]/.test(path)),
    );
  } catch {
    return ["en"];
  }
}
export function authReturnPath(
  next: string | null,
  market: Market,
  env: Record<string, string | undefined> = process.env,
) {
  const route = splitLocalePath(next ?? "");
  if (
    !["/account", "/checkout", "/auth/update-password"].includes(route.path) ||
    !enabledLocales(market, env).includes(route.locale)
  )
    return "/account";
  return localizedHref(route.path, route.locale);
}

export function replenishmentSignInTarget(next: string | null, market: Market) {
  const route = splitLocalePath(next ?? "");
  const review =
    /^\/account\/replenishment\?review=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      route.path,
    );
  if (!review || !enabledLocales(market).includes(route.locale))
    return undefined;
  return localizedHref(
    `/account/replenishment?review=${review[1].toLowerCase()}`,
    route.locale,
  );
}
