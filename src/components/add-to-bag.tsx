"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "./store-provider";
import { trackCommerce } from "@/lib/commerce-analytics";
export function AddToBag({
  id,
  track,
}: {
  id: string;
  /** Optional consent-gated add_to_cart details (no customer data). */
  track?: { currency: string; name: string; priceMinor: number | null };
}) {
  const { add } = useStore();
  const [added, setAdded] = useState(false);
  return (
    <>
      <button
        className="button"
        onClick={() => {
          add(id);
          setAdded(true);
          if (track)
            trackCommerce({
              name: "add_to_cart",
              currency: track.currency,
              items: [
                {
                  id,
                  name: track.name,
                  quantity: 1,
                  priceMinor: track.priceMinor,
                },
              ],
            });
        }}
      >
        Add to bag for review
      </button>
      {added && (
        <p role="status">
          Added to your bag. <Link href="/cart">View bag →</Link>
        </p>
      )}
      <p className="muted small">
        Products may be saved for review. Online purchasing is unavailable.
      </p>
    </>
  );
}
