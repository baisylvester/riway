"use client";
import { usePathname } from "next/navigation";
import { Header, Footer } from "./chrome";
import type { Market } from "@/lib/domain";
export function SiteChrome({
  market,
  children,
}: {
  market: Market;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const reference = ["/", "/purtier", "/conscientious"].includes(path);
  return (
    <>
      {!reference && <Header market={market} />}
      <main id="main">{children}</main>
      {!reference && <Footer />}
    </>
  );
}
