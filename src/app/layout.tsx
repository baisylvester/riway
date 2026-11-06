import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
import "./reference.css";
import { StoreProvider } from "@/components/store-provider";
import { SiteChrome } from "@/components/site-chrome";
import { currentMarket } from "@/lib/data";
import { ClerkProvider } from "@clerk/nextjs";
import { authProvider } from "@/lib/auth-config";
export const metadata: Metadata = {
  title: {
    default: "RIWAY International · A world of possibilities",
    template: "%s | RIWAY International",
  },
  description:
    "Discover the world of RIWAY International, our collections, community and shared vision.",
  robots: { index: false, follow: false },
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
    </StoreProvider>
  );
  return (
    <html lang="en">
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
