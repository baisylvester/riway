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
        ["packages", "Package drafts"],
        ["promotions", "Promotion drafts"],
        ["memberships", "Membership"],
        ["inventory", "Inventory"],
        ["centres", "Service centres"],
        ["orders", "Orders"],
        ["payments", "Payments"],
        ["reports", "Sales reports"],
        ["compensation", "RIWAY volume sync"],
        ["distributors", "Distributor tools"],
        ["library", "Campaign library"],
        ["product-content", "Product content"],
        ["content", "Content"],
        ["events", "Event attendance"],
        ["media", "Media library"],
        ["support", "Support requests"],
        ["privacy", "Privacy requests"],
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
