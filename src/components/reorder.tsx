"use client";

import Link from "next/link";
import { useState } from "react";
import { cartSchema, mergeCart, type CartItem } from "@/lib/domain";
import { useStore } from "./store-provider";

export function Reorder({ items }: { items: CartItem[] }) {
  const store = useStore();
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(false);
  return (
    <div>
      <button className="button" disabled={!store.ready || !items.length || added}
        onClick={() => {
          try {
            const previous = cartSchema.parse(items);
            const merged = previous.reduce(
              (bag, item) => mergeCart(bag, item.productId, item.quantity),
              store.items,
            );
            store.restore(merged);
            setAdded(true);
            setMessage("Products copied to your bag. Review current availability, prices and quantities before checkout.");
          } catch {
            setMessage("These products could not be copied. Review your bag or choose products from the catalogue.");
          }
        }}>
        {added ? "Copied to bag" : "Reorder products"}
      </button>
      <p role="status">{message} {added && <Link href="/cart">Review bag →</Link>}</p>
    </div>
  );
}
