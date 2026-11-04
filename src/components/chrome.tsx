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
import { useEffect, useRef, useState } from "react";
import { useStore } from "./store-provider";
import { markets, type Market } from "@/lib/domain";
export function Header({ market }: { market: Market }) {
  const { items } = useStore(),
    path = usePathname(),
    router = useRouter();
  const [open, setOpen] = useState(false);
  const [marketError, setMarketError] = useState("");
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const nav = navigation.current;
    const trigger = menuButton.current;
    const mobile = matchMedia("(max-width: 760px)");
    if (!mobile.matches) return;
    const outside = [
      document.getElementById("main"),
      document.querySelector("footer"),
    ].filter(Boolean) as HTMLElement[];
    outside.forEach((el) => (el.inert = true));
    nav?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = () => setOpen(false);
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const links = Array.from(
          nav?.querySelectorAll<HTMLElement>("a,button,select") || [],
        );
        const focusable = [...links, trigger].filter(Boolean) as HTMLElement[];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          focusable.at(-1)?.focus();
        }
        if (!e.shiftKey && index === focusable.length - 1) {
          e.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    mobile.addEventListener("change", close);
    return () => {
      document.removeEventListener("keydown", keydown);
      mobile.removeEventListener("change", close);
      outside.forEach((el) => (el.inert = false));
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);
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
          id="main-navigation"
          ref={navigation}
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
          <div className="rw-menu-extra">
            <Link href="/stories" onClick={() => setOpen(false)}>
              Stories
            </Link>
            <Link href="/support" onClick={() => setOpen(false)}>
              Contact & support
            </Link>
            <Link href="/distributor" onClick={() => setOpen(false)}>
              Distributor area
            </Link>
            <Link href="/account" onClick={() => setOpen(false)}>
              Member account
            </Link>
            <Link href="/cart" onClick={() => setOpen(false)}>
              Review bag
            </Link>
          </div>
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
            ref={menuButton}
            aria-controls="main-navigation"
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
      <span className="rw-footer-word" aria-hidden="true">
        RIWAY
      </span>
      <p className="rw-footer-notice">
        Explore our collections and save products to your review bag. Online
        purchasing and payment collection are unavailable. Contact RIWAY for
        approved market-specific product information.
      </p>
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
