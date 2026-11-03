"use client";
import Link from "next/link";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useStore } from "./store-provider";
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
  const [message, setMessage] = useState("");
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
  async function restoreBag() {
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
          <button className="button button-outline" onClick={restoreBag}>
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
            <label>
              <span className="sr-only">
                Quantity for {p?.name ?? "unavailable product"}
              </span>
              <input
                aria-label={`Quantity for ${p?.name ?? "unavailable product"}`}
                type="number"
                min={1}
                max={o?.max_quantity ?? 24}
                value={i.quantity}
                onChange={(e) => update(i.productId, Number(e.target.value))}
              />
            </label>
            <button
              className="delete-button"
              aria-label={`Remove ${p?.name ?? "unavailable product"}`}
              onClick={() => update(i.productId, 0)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="hero-buttons" style={{ marginTop: 25 }}>
          <button
            className="button button-outline"
            onClick={async () => {
              try {
                const r = await fetch("/api/cart", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(items),
                });
                const d = await r.json();
                setMessage(
                  r.ok
                    ? "Your bag was saved to your account."
                    : d.error.message,
                );
              } catch {
                setMessage("Your bag could not be saved. Try again.");
              }
            }}
          >
            Save bag to account
          </button>
          <button
            className="button button-outline"
            onClick={async () => {
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
              }
            }}
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
          {items.reduce((a, i) => a + i.quantity, 0)} items ·{" "}
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
