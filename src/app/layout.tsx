import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/components/store-provider";
import { Header, Footer } from "@/components/chrome";
import { currentMarket } from "@/lib/data";
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
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Header market={market} />
          <main id="main">{children}</main>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
