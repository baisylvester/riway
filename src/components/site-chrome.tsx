"use client";
import { usePathname } from "next/navigation";
import { Header, Footer } from "./chrome";
import type { Market } from "@/lib/domain";
import { splitLocalePath } from "@/lib/locales";
import { useLocale, Ui } from "./locale-provider";
export function SiteChrome({
  market,
  children,
}: {
  market: Market;
  children: React.ReactNode;
}) {
  const path = splitLocalePath(usePathname()).path;
  const { locale } = useLocale();
  const reference = ["/", "/purtier", "/conscientious"].includes(path);
  return (
    <>
      {!reference && <Header market={market} />}
      {locale !== "en" && (
        <p className="notice locale-fallback" lang={locale}>
          <Ui id="fallback" />
        </p>
      )}
      <main id="main" lang="en">
        {children}
      </main>
      {!reference && <Footer />}
    </>
  );
}
