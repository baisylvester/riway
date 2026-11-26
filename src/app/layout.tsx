import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import "./reference.css";
import { StoreProvider } from "@/components/store-provider";
import { SiteChrome } from "@/components/site-chrome";
import { currentMarket } from "@/lib/data";
import { ClerkProvider } from "@clerk/nextjs";
import { authProvider } from "@/lib/auth-config";
import {
  searchIndexingEnabled,
  siteOrigin,
  privateRobotsPaths,
} from "@/lib/seo";
import { ConsentManager } from "@/components/consent-manager";
import { clientValidationBootstrap } from "@/lib/client-validation";
import { headers } from "next/headers";
import { currentLocale } from "@/lib/locale-server";
import {
  enabledLocales,
  localizedHref,
  localizedSeoLocales,
  localizablePath,
} from "@/lib/locales";
import { LocaleProvider, Ui } from "@/components/locale-provider";
const baseMetadata: Metadata = {
  title: {
    default: "RIWAY International · A world of possibilities",
    template: "%s | RIWAY International",
  },
  description:
    "Discover the world of RIWAY International, our collections, community and shared vision.",
  metadataBase: new URL(siteOrigin()),
  robots: searchIndexingEnabled()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};
export async function generateMetadata(): Promise<Metadata> {
  const [locale, requestHeaders] = await Promise.all([
    currentLocale(),
    headers(),
  ]);
  const path = requestHeaders.get("x-riway-path") ?? "/";
  if (
    !localizablePath(path) ||
    privateRobotsPaths.some(
      (p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"),
    ) ||
    path.startsWith("/materials/") ||
    path.startsWith("/reference/")
  )
    return { ...baseMetadata, robots: { index: false, follow: false } };
  const seo = localizedSeoLocales(path),
    approved = seo.includes(locale);
  return {
    ...baseMetadata,
    ...(!approved ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical: localizedHref(path, approved ? locale : "en"),
      languages: Object.fromEntries([
        ...seo.map((l) => [l, localizedHref(path, l)]),
        ["x-default", path],
      ]),
    },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [market, locale] = await Promise.all([
    currentMarket(),
    currentLocale(),
  ]);
  const content = (
    <LocaleProvider locale={locale} available={enabledLocales(market)}>
      <StoreProvider>
        <a className="skip-link" href="#main">
          <Ui id="skip" />
        </a>
        <SiteChrome market={market}>{children}</SiteChrome>
        <ConsentManager />
      </StoreProvider>
    </LocaleProvider>
  );
  return (
    <html lang={locale}>
      <head>
        <script
          id="validation-config"
          dangerouslySetInnerHTML={{ __html: clientValidationBootstrap }}
        />
      </head>
      <body>
        {authProvider() === "clerk" ? (
          <ClerkProvider signInUrl="/auth/login" signUpUrl="/auth/register">
            {content}
          </ClerkProvider>
        ) : (
          content
        )}
      </body>
    </html>
  );
}
