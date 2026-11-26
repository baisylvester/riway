"use client";
import Link from "@/components/localized-link";
import Image from "next/image";
import { useRef, useState } from "react";
import { useStore } from "./store-provider";
import { CartQuantity } from "./cart-quantity";
import { useLocale, useUi } from "./locale-provider";
import {
  cartSchema,
  money,
  markets,
  type Product,
  type Offer,
  type Market,
} from "@/lib/domain";
export function Cart({
  products,
  offers,
  market,
}: {
  products: Product[];
  offers: Offer[];
  market: Market;
}) {
  const t = useUi(),
    { locale } = useLocale();
  const { items, ready, update, restore } = useStore();
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);
  const unknown = items.some(
    (i) => !products.some((p) => p.id === i.productId),
  );
  const prices = items.map((i) => ({
    i,
    p: products.find((p) => p.id === i.productId),
    o: offers.find((o) => o.product_id === i.productId && o.market === market),
  }));
  const total = prices.every((x) => x.o?.retail_minor != null)
    ? prices.reduce((a, x) => a + x.o!.retail_minor! * x.i.quantity, 0)
    : null;
  async function saveBag() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      const data = await response.json();
      setMessage(
        response.ok
          ? items.length
            ? t("bagSaved")
            : t("emptyBagSaved")
          : (data.error?.message ?? t("bagSaveError")),
      );
    } catch {
      setMessage(t("bagSaveError"));
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }
  async function restoreBag() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const r = await fetch("/api/cart");
      const d = await r.json();
      if (!r.ok) {
        setMessage(d.error.message);
        return;
      }
      const parsed = cartSchema.safeParse(d.items);
      if (!parsed.success) throw Error();
      restore(parsed.data);
      setMessage(t("bagRestored"));
    } catch {
      setMessage(t("bagRestoreError"));
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }
  if (!ready) return <p>{t("loadingBag")}</p>;
  if (!items.length)
    return (
      <div className="empty">
        <h2>{t("emptyBag")}</h2>
        <p>{t("emptyBagHelp")}</p>
        <Link className="button" href="/shop">
          {t("exploreCollections")}
        </Link>
        <p>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={saveBag}
          >
            {t("saveEmptyBag")}
          </button>
        </p>
        <p>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={restoreBag}
          >
            {t("restoreBag")}
          </button>
        </p>
        <p role="status">{message}</p>
      </div>
    );
  return (
    <div className="two-column">
      <div>
        {prices.map(({ i, p, o }) => (
          <div className="cart-line" key={i.productId}>
            <div className="cart-thumbnail">
              {p && (
                <Image
                  src={
                    p.slug === "purtier-placenta"
                      ? "/images/purtier.png"
                      : "/images/conscientious.jpg"
                  }
                  width={70}
                  height={80}
                  alt=""
                />
              )}
            </div>
            <div>
              <h3>{p?.name ?? t("unavailableProduct")}</h3>
              <p className="small muted">
                {o?.retail_minor == null
                  ? t("pricingPending")
                  : money(o.retail_minor, markets[market].currency, locale)}
              </p>
            </div>
            <CartQuantity
              productName={p?.name ?? "unavailable product"}
              quantity={i.quantity}
              maximum={o?.max_quantity ?? 24}
              onCommit={(quantity) => update(i.productId, quantity)}
              onRemove={() => update(i.productId, 0)}
            />
          </div>
        ))}
        <div className="hero-buttons" style={{ marginTop: 25 }}>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={saveBag}
          >
            {t("saveBag")}
          </button>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={restoreBag}
          >
            {t("restoreBag")}
          </button>
          <Link href="/shop" className="text-link">
            {t("continueExploring")} →
          </Link>
        </div>
        <p role="status">{message}</p>
      </div>
      <aside className="panel">
        <h2>{t("yourSelection")}</h2>
        <p className="small muted">
          {locale === "en"
            ? `${itemCount} ${itemCount === 1 ? "item" : "items"}`
            : t("itemsCount", { count: itemCount })}{" "}
          · {markets[market].name}
        </p>
        <div className="price">
          {total === null
            ? t("pricingPending")
            : money(total, markets[market].currency, locale)}
        </div>
        <div className="notice" lang="en">
          Online purchasing is unavailable. Prices, shipping and taxes require
          approved market configuration.
        </div>
        {unknown && <p className="error-message">{t("removeUnavailable")}</p>}
        <Link className="button" href="/checkout">
          {t("checkout")}
        </Link>
      </aside>
    </div>
  );
}
