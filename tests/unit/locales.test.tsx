import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/lib/supabase/server", () => ({ db: vi.fn() }));
import {
  enabledLocales,
  localizedHref,
  splitLocalePath,
  localizablePath,
  localizedSeoLocales,
  locales,
  authReturnPath,
} from "@/lib/locales";
import { dictionaries, english, ui } from "@/lib/ui-dictionaries";
import { LocaleProvider, Ui } from "@/components/locale-provider";
import Link from "@/components/localized-link";
import { pickSections } from "@/lib/cms-pages";
import { sitemapEntries } from "@/lib/seo";
const env = {
  UI_TRANSLATION_APPROVAL_REFERENCE: "SYNTHETIC-REVIEW",
  UI_LOCALES_PH: "fil,ms,zh-CN",
  UI_LOCALES_MY: "ms",
  LOCALIZED_SEO_PATHS: '{"fil":["/shop"]}',
};
describe("locale publication and routing", () => {
  it("allows only approved local auth return paths", () => {
    expect(authReturnPath("/fil/checkout", "PH", env)).toBe("/fil/checkout");
    expect(authReturnPath("/ms/auth/update-password", "MY", env)).toBe(
      "/ms/auth/update-password",
    );
    expect(authReturnPath("/fil/account", "SG", env)).toBe("/account");
    for (const next of [
      "https://evil.invalid/checkout",
      "//evil.invalid",
      "/fil/admin",
      "/fil/account?redirect=evil",
      "/%2f%2fevil.invalid",
    ])
      expect(authReturnPath(next, "PH", env)).toBe("/account");
  });
  it("requires an approval reference and an explicit market list", () => {
    expect(enabledLocales("PH", {})).toEqual(["en"]);
    expect(enabledLocales("PH", { UI_LOCALES_PH: "fil" })).toEqual(["en"]);
    expect(enabledLocales("PH", env)).toEqual(["en", "fil", "ms", "zh-CN"]);
    expect(enabledLocales("SG", env)).toEqual(["en"]);
    expect(enabledLocales("MY", env)).toEqual(["en", "ms"]);
  });
  it("ignores unknown, duplicated and object-prototype locale values", () => {
    expect(
      enabledLocales("PH", {
        ...env,
        UI_LOCALES_PH: "fil,fil,__proto__,xx,EN",
      }),
    ).toEqual(["en", "fil"]);
  });
  it("preserves queries, hashes, encoded values and canonical category values", () => {
    expect(
      localizedHref("/shop?q=care%20kit&category=Nutrition#results", "fil"),
    ).toBe("/fil/shop?q=care%20kit&category=Nutrition#results");
    expect(localizedHref("/fil/shop?q=%2F", "zh-CN")).toBe("/zh-CN/shop?q=%2F");
    expect(localizedHref("/fil?x=1#top", "en")).toBe("/?x=1#top");
    expect(localizedHref("/?x=1", "ms")).toBe("/ms?x=1");
  });
  it("normalizes locale aliases and separates protected paths before authentication", () => {
    expect(splitLocalePath("/FIL/account/orders")).toEqual({
      locale: "fil",
      path: "/account/orders",
      prefixed: true,
    });
    expect(splitLocalePath("/account")).toEqual({
      locale: "en",
      path: "/account",
      prefixed: false,
    });
  });
  it.each([
    "/api/checkout",
    "/admin/returns",
    "/operations",
    "/auth/callback",
    "/_next/static/a.js",
    "//evil.invalid",
    "/shop/../api",
    "/shop/%2fapi",
    "/shop/\\api",
  ])("never localizes infrastructure or unsafe path %s", (path) => {
    expect(localizablePath(path)).toBe(false);
    expect(localizedHref(path, "fil")).toBe(path);
  });
  it("preserves external, hash-only and protocol links", () => {
    for (const href of [
      "https://www.riway.com/",
      "mailto:contact@example.invalid",
      "#products",
    ])
      expect(localizedHref(href, "fil")).toBe(href);
  });
  it("does not advertise a UI translation as a complete translated page", () => {
    expect(localizedSeoLocales("/about", env)).toEqual(["en"]);
    expect(localizedSeoLocales("/shop", env)).toEqual(["en", "fil"]);
    expect(
      localizedSeoLocales("/shop", { ...env, LOCALIZED_SEO_PATHS: "broken" }),
    ).toEqual(["en"]);
    const entries = sitemapEntries("https://example.invalid", {}, env);
    expect(
      entries.filter((e) => e.url.includes("/fil/")).map((e) => e.url),
    ).toEqual(["https://example.invalid/fil/shop"]);
    expect(
      entries.find((e) => e.url.endsWith("/fil/shop"))?.alternates?.languages,
    ).toEqual({
      en: "https://example.invalid/shop",
      fil: "https://example.invalid/fil/shop",
      "x-default": "https://example.invalid/shop",
    });
  });
});
describe("translated rendering and content fallback", () => {
  it("keeps all dictionary keys and named parameters complete", () => {
    for (const locale of locales) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(
        Object.keys(english).sort(),
      );
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        expect(dictionaries[locale][key].trim()).not.toBe("");
        expect(dictionaries[locale][key].match(/\{[a-z]+\}/g) ?? []).toEqual(
          english[key].match(/\{[a-z]+\}/g) ?? [],
        );
      }
    }
  });
  it("renders translated labels and localized links in SSR while escaping values", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider locale="fil" available={["en", "fil"]}>
        <Ui id="collections" />
        <Link href="/cart">
          <Ui id="bag" />
        </Link>
        <Ui id="itemsCount" values={{ count: "<script>bad</script>" }} />
      </LocaleProvider>,
    );
    expect(markup).toContain("Aming mga koleksiyon");
    expect(markup).toContain('href="/fil/cart"');
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
    expect(ui("zh-CN", "search")).toBe("搜索");
  });
  it("identifies actual CMS language and never presents an English fallback as translated", () => {
    const rows = [
      {
        slug: "support-contacts",
        title: "Contacts",
        body: "English approved content",
      },
      {
        slug: "support-contacts-ph-fil",
        title: "Mga contact",
        body: "Filipino approved content",
      },
    ];
    expect(
      pickSections(["support-contacts"], "PH", rows, "fil")[0],
    ).toMatchObject({ locale: "fil", body: "Filipino approved content" });
    expect(
      pickSections(
        ["support-contacts"],
        "MY",
        rows.filter((r) => r.slug === "support-contacts"),
        "ms",
      )[0],
    ).toMatchObject({ locale: "en", body: "English approved content" });
  });
});
