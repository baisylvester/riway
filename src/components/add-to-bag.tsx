"use client";
import { useState } from "react";
import Link from "@/components/localized-link";
import { useStore } from "./store-provider";
import { trackCommerce } from "@/lib/commerce-analytics";
import { useUi, useLocale } from "./locale-provider";
export function AddToBag({
  id,
  track,
}: {
  id: string;
  /** Optional consent-gated add_to_cart details (no customer data). */
  track?: { currency: string; name: string; priceMinor: number | null };
}) {
  const t = useUi(),
    { locale } = useLocale();
  const { add } = useStore();
  const [added, setAdded] = useState(false);
  return (
    <>
      <button
        lang={locale}
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
        {t("addBag")}
      </button>
      {added && (
        <p role="status" lang={locale}>
          {t("addedBag")} <Link href="/cart">{t("viewBag")} →</Link>
        </p>
      )}
      <p className="muted small" lang="en">
        Products may be saved for review. Online purchasing is unavailable.
      </p>
    </>
  );
}
