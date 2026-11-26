"use client";
import Link from "@/components/localized-link";
import { CookieSettingsButton } from "./consent-manager";
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
import { useLocale, useUi } from "./locale-provider";
import { LanguagePicker } from "./language-picker";
import { localizedHref, splitLocalePath } from "@/lib/locales";
export function Header({ market }: { market: Market }) {
  const t = useUi(),
    { locale } = useLocale();
  const { items } = useStore(),
    path = usePathname(),
    router = useRouter();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
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
    ["/about", t("about")],
    ["/shop", t("collections")],
    ["/membership", t("opportunity")],
    ["/events", t("events")],
  ];
  return (
    <>
      <div className="announcement">
        {t("announcement")}{" "}
        <Link href="/about">
          {t("discover")} <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="header">
        <Link className="wordmark" href="/" aria-label={t("home")}>
          RIWAY<span>INTERNATIONAL</span>
        </Link>
        <nav
          id="main-navigation"
          ref={navigation}
          className={open ? "navigation open" : "navigation"}
          aria-label={t("navigation")}
        >
          {links.map(([url, label]) => (
            <Link
              key={url}
              href={url}
              onClick={() => setOpen(false)}
              aria-current={
                splitLocalePath(path).path.startsWith(url) ? "page" : undefined
              }
            >
              {label}
            </Link>
          ))}
          <div className="rw-menu-extra">
            <Link href="/stories" onClick={() => setOpen(false)}>
              {t("stories")}
            </Link>
            <Link href="/support" onClick={() => setOpen(false)}>
              {t("support")}
            </Link>
            <Link href="/distributor" onClick={() => setOpen(false)}>
              {t("distributor")}
            </Link>
            <Link href="/account" onClick={() => setOpen(false)}>
              {t("account")}
            </Link>
            <Link href="/cart" onClick={() => setOpen(false)}>
              {t("bag")}
            </Link>
          </div>
        </nav>
        <div className="header-actions">
          <label className="market">
            <Globe2 size={15} />
            <span className="sr-only">{t("country")}</span>
            <select
              name="market"
              aria-label={t("country")}
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
                  const chosen = await result.json();
                  if (locale !== "en" && !chosen.locales?.includes(locale)) {
                    window.location.assign(
                      localizedHref(
                        path + window.location.search + window.location.hash,
                        "en",
                      ),
                    );
                    return;
                  }
                  router.refresh();
                } catch {
                  setMarketError(t("countryError"));
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
          <LanguagePicker />
          <Link className="icon-link" href="/account" aria-label={t("account")}>
            <UserRound size={19} />
          </Link>
          <Link
            className="icon-link bag"
            href="/cart"
            aria-label={
              locale === "en"
                ? `Shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
                : t("bagCount", { count: itemCount })
            }
          >
            <ShoppingBag size={20} />
            <span>{itemCount}</span>
          </Link>
          <button
            ref={menuButton}
            aria-controls="main-navigation"
            className="mobile-menu"
            aria-label={t(open ? "closeMenu" : "openMenu")}
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
  const t = useUi();
  return (
    <footer>
      <div className="footer-top">
        <Link className="wordmark" href="/">
          RIWAY<span>INTERNATIONAL</span>
        </Link>
        <p>
          {t("people")}
          <br />
          {t("possibilities")}
        </p>
        <div>
          <Link href="/about">{t("about")}</Link>
          <Link href="/stories">{t("stories")}</Link>
          <Link href="/support">{t("support")}</Link>
        </div>
        <div>
          <Link href="/account">{t("memberArea")}</Link>
          <Link href="/distributor">{t("distributor")}</Link>
          <Link href="/legal">{t("policies")}</Link>
        </div>
      </div>
      <span className="rw-footer-word" aria-hidden="true">
        RIWAY
      </span>
      <p className="rw-footer-notice" lang="en">
        Explore our collections and save products to your review bag. Online
        purchasing and payment collection are unavailable. Contact RIWAY for
        approved market-specific product information.
      </p>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} RIWAY International. {t("rights")}
        </span>
        <span>{t("preview")}</span>
        <Link href="/legal/privacy">{t("privacy")}</Link>
        <Link href="/legal/cookies">{t("cookies")}</Link>
        <CookieSettingsButton />
      </div>
    </footer>
  );
}
