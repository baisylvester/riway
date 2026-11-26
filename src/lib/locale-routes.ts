import { isLocale, localizablePath, type Locale } from "./locales";

// Explicit App Router entrypoints reuse the existing pages and account layout.
// No API, staff, webhook or callback module can be loaded through this map.
const pages = {
  "/": () => import("@/app/page"),
  "/about": () => import("@/app/about/page"),
  "/shop": () => import("@/app/shop/page"),
  "/cart": () => import("@/app/cart/page"),
  "/checkout": () => import("@/app/checkout/page"),
  "/membership": () => import("@/app/membership/page"),
  "/membership/demo": () => import("@/app/membership/demo/page"),
  "/stories": () => import("@/app/stories/page"),
  "/events": () => import("@/app/events/page"),
  "/support": () => import("@/app/support/page"),
  "/legal": () => import("@/app/legal/page"),
  "/purtier": () => import("@/app/purtier/page"),
  "/conscientious": () => import("@/app/conscientious/page"),
  "/find-a-distributor": () => import("@/app/find-a-distributor/page"),
  "/account": () => import("@/app/account/page"),
  "/account/membership": () => import("@/app/account/membership/page"),
  "/account/orders": () => import("@/app/account/orders/page"),
  "/account/addresses": () => import("@/app/account/addresses/page"),
  "/account/security": () => import("@/app/account/security/page"),
  "/account/privacy": () => import("@/app/account/privacy/page"),
  "/account/consultations": () => import("@/app/account/consultations/page"),
  "/account/assistant": () => import("@/app/account/assistant/page"),
  "/account/preferences": () => import("@/app/account/preferences/page"),
  "/auth/login": () => import("@/app/auth/login/page"),
  "/auth/register": () => import("@/app/auth/register/page"),
  "/auth/reset": () => import("@/app/auth/reset/page"),
  "/auth/update-password": () => import("@/app/auth/update-password/page"),
  "/shop/:slug": () => import("@/app/shop/[slug]/page"),
  "/stories/:slug": () => import("@/app/stories/[slug]/page"),
  "/events/:slug": () => import("@/app/events/[slug]/page"),
  "/legal/:slug": () => import("@/app/legal/[slug]/page"),
  "/d/:code": () => import("@/app/d/[code]/page"),
  "/materials/:id": () => import("@/app/materials/[id]/page"),
  "/reference/:id": () => import("@/app/reference/[id]/page"),
  "/account/orders/:id": () => import("@/app/account/orders/[id]/page"),
  "/account/privacy/:id": () => import("@/app/account/privacy/[id]/page"),
} as const;
export function localizedRoute(locale: string, segments: string[] = []) {
  if (
    !isLocale(locale) ||
    locale === "en" ||
    segments.some(
      (s) =>
        !s || s === "." || s === ".." || s.includes("/") || s.includes("\\"),
    )
  )
    return null;
  const path = "/" + segments.join("/");
  if (!localizablePath(path)) return null;
  for (const key of Object.keys(pages) as (keyof typeof pages)[]) {
    const parts = key === "/" ? [] : key.slice(1).split("/");
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = segments[i];
      else if (parts[i] !== segments[i]) matches = false;
    }
    if (matches)
      return {
        locale: locale as Locale,
        path,
        params,
        account: path === "/account" || path.startsWith("/account/"),
        load: pages[key],
      };
  }
  return null;
}
