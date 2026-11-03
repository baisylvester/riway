"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Globe2,
  ShoppingBag,
  UserRound,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "./store-provider";
import { markets, type Market } from "@/lib/domain";
export function Header({ market }: { market: Market }) {
  const { items } = useStore(),
    path = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const [marketError, setMarketError] = useState("");
  const links = [
    ["/about", "Our world"],
    ["/shop", "Our collections"],
    ["/membership", "Opportunity"],
    ["/events", "Events"],
  ];
  return (
    <>
      <div className="announcement">
        A shared vision. A world of possibilities.{" "}
        <Link href="/about">
          Discover RIWAY <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="header">
        <Link className="wordmark" href="/" aria-label="RIWAY home">
          RIWAY<span>INTERNATIONAL</span>
        </Link>
        <nav
          className={open ? "navigation open" : "navigation"}
          aria-label="Main navigation"
        >
          {links.map(([url, label]) => (
            <Link
              key={url}
              href={url}
              onClick={() => setOpen(false)}
              aria-current={path.startsWith(url) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <label className="market">
            <Globe2 size={15} />
            <span className="sr-only">Select country</span>
            <select
              aria-label="Select country"
              value={market}
              onChange={async (e) => {
                setMarketError("");
                try {
                  const result = await fetch("/api/market", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ market: e.target.value }),
                  });
                  if (!result.ok) throw new Error();
                  router.refresh();
                } catch {
                  setMarketError(
                    "Your country could not be changed. Please try again.",
                  );
                }
              }}
            >
              {Object.entries(markets).map(([key, v]) => (
                <option key={key} value={key}>
                  {v.name} · {key}
                </option>
              ))}
            </select>
          </label>
          <Link
            className="icon-link"
            href="/account"
            aria-label="Member account"
          >
            <UserRound size={19} />
          </Link>
          <Link
            className="icon-link bag"
            href="/cart"
            aria-label={`Shopping bag, ${items.reduce((a, i) => a + i.quantity, 0)} items`}
          >
            <ShoppingBag size={20} />
            <span>{items.reduce((a, i) => a + i.quantity, 0)}</span>
          </Link>
          <button
            className="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {marketError && (
        <p className="notice" role="status">
          {marketError}
        </p>
      )}
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <Link className="wordmark" href="/">
          RIWAY<span>INTERNATIONAL</span>
        </Link>
        <p>
          Bringing people together.
          <br />
          Opening a world of possibilities.
        </p>
        <div>
          <Link href="/about">Our world</Link>
          <Link href="/stories">Stories</Link>
          <Link href="/support">Contact & support</Link>
        </div>
        <div>
          <Link href="/account">Member area</Link>
          <Link href="/distributor">Distributor area</Link>
          <Link href="/legal">Policies & conduct</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} RIWAY International. All rights reserved.
        </span>
        <span>Development preview · Online purchasing unavailable</span>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/cookies">Cookies</Link>
      </div>
    </footer>
  );
}
