"use client";

import { useEffect, useRef } from "react";
import {
  trackCommerce,
  type CommerceEvent,
  type CommerceItem,
} from "@/lib/commerce-analytics";

// Fires one consent-gated ecommerce event after mount. Scripts start only after
// consent, so a short retry lets a just-granted GA4/Pixel stub attach first.
function useTrackOnce(event: CommerceEvent | null) {
  const done = useRef(false);
  const key = event ? JSON.stringify(event) : "";
  useEffect(() => {
    if (!key || done.current) return;
    let tries = 0;
    const attempt = () => {
      if (done.current) return;
      const parsed = JSON.parse(key) as CommerceEvent;
      if (trackCommerce(parsed).length || ++tries >= 3) done.current = true;
      else timer = window.setTimeout(attempt, 1500);
    };
    let timer = window.setTimeout(attempt, 300);
    return () => window.clearTimeout(timer);
  }, [key]);
}

export function TrackViewItem({
  currency,
  item,
}: {
  currency: string;
  item: CommerceItem;
}) {
  useTrackOnce({ name: "view_item", currency, items: [item] });
  return null;
}

export function TrackBeginCheckout({
  currency,
  items,
}: {
  currency: string;
  items: CommerceItem[];
}) {
  useTrackOnce(
    items.length ? { name: "begin_checkout", currency, items } : null,
  );
  return null;
}

/** Render only for an order the server has verified as paid. */
export function TrackPurchase({
  orderId,
  currency,
  valueMinor,
  items,
}: {
  orderId: string;
  currency: string;
  valueMinor: number;
  items: CommerceItem[];
}) {
  useTrackOnce({
    name: "purchase",
    currency,
    transactionId: orderId,
    valueMinor,
    items,
  });
  return null;
}
