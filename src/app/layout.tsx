import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import "./reference.css";
import { StoreProvider } from "@/components/store-provider";
import { SiteChrome } from "@/components/site-chrome";
import { currentMarket } from "@/lib/data";
import { ClerkProvider } from "@clerk/nextjs";
import { authProvider } from "@/lib/auth-config";
import { searchIndexingEnabled, siteOrigin } from "@/lib/seo";
import { ConsentManager } from "@/components/consent-manager";
import { clientValidationBootstrap } from "@/lib/client-validation";
export const metadata: Metadata = {
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
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const market = await currentMarket();
  const content = (
    <StoreProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteChrome market={market}>{children}</SiteChrome>
      <ConsentManager />
    </StoreProvider>
  );
  return (
    <html lang="en">
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
