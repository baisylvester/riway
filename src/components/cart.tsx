"use client";
import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { useStore } from "./store-provider";
import { CartQuantity } from "./cart-quantity";
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
            ? "Your bag was saved to your account."
            : "Your empty bag was saved to your account."
          : (data.error?.message ?? "Your bag could not be saved. Try again."),
      );
    } catch {
      setMessage("Your bag could not be saved. Try again.");
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
      setMessage("Your saved account bag was restored.");
    } catch {
      setMessage("Your saved bag could not be restored.");
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }
  if (!ready) return <p>Loading your bag…</p>;
  if (!items.length)
    return (
      <div className="empty">
        <h2>Your bag is waiting for a discovery.</h2>
        <p>Explore our collections and save a product for review.</p>
        <Link className="button" href="/shop">
          Explore collections
        </Link>
        <p>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={saveBag}
          >
            Save empty bag to account
          </button>
        </p>
        <p>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={restoreBag}
          >
            Restore account bag
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
              <h3>{p?.name ?? "Unavailable product"}</h3>
              <p className="small muted">
                {money(o?.retail_minor ?? null, markets[market].currency)}
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
            Save bag to account
          </button>
          <button
            className="button button-outline"
            disabled={pending}
            onClick={restoreBag}
          >
            Restore account bag
          </button>
          <Link href="/shop" className="text-link">
            Continue exploring →
          </Link>
        </div>
        <p role="status">{message}</p>
      </div>
      <aside className="panel">
        <h2>Your selection</h2>
        <p className="small muted">
          {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
          {markets[market].name}
        </p>
        <div className="price">{money(total, markets[market].currency)}</div>
        <div className="notice">
          Online purchasing is unavailable. Prices, shipping and taxes require
          approved market configuration.
        </div>
        {unknown && (
          <p className="error-message">
            Remove unavailable products before continuing.
          </p>
        )}
        <Link className="button" href="/checkout">
          Review checkout
        </Link>
      </aside>
    </div>
  );
}
