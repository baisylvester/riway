"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="admin-nav" aria-label="Administration">
      {[
        ["", "Overview"],
        ["products", "Products"],
        ["pricing", "Pricing"],
        ["inventory", "Inventory"],
        ["orders", "Orders"],
        ["content", "Content"],
        ["media", "Media library"],
        ["support", "Support requests"],
        ["audit", "Audit trail"],
        ["integrations", "Launch readiness"],
      ].map(([s, l]) => (
        <Link
          href={`/admin${s ? "/" + s : ""}`}
          aria-current={
            path === `/admin${s ? "/" + s : ""}` ? "page" : undefined
          }
          key={s}
        >
          {l}
        </Link>
      ))}
    </nav>
  );
}
