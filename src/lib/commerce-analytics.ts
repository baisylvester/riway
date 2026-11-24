import { readConsentCookie } from "@/lib/consent";

// Consent-aware ecommerce events (audit G23). Events are sent only when the
// visitor opted in AND the matching script was started by ConsentManager:
// GA4 needs analytics consent, Meta Pixel needs marketing consent. Payloads
// carry product identifiers, names, quantities and amounts only, never a name,
// email, phone, address or account identifier. A purchase is reported only
// from a server-verified paid order and at most once per browser per order;
// the order id doubles as GA4 transaction_id / Pixel eventID so the providers
// can also deduplicate.

export type CommerceItem = {
  id: string;
  name: string;
  quantity: number;
  /** Unit price in minor units, when known server-side. */
  priceMinor?: number | null;
};
export type CommerceEvent =
  | { name: "view_item"; currency: string; items: CommerceItem[] }
  | { name: "add_to_cart"; currency: string; items: CommerceItem[] }
  | { name: "begin_checkout"; currency: string; items: CommerceItem[] }
  | {
      name: "purchase";
      currency: string;
      transactionId: string;
      valueMinor: number;
      items: CommerceItem[];
    };

type Env = {
  cookie: string;
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

const pixelNames = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
} as const;

const major = (minor: number) => Math.round(minor) / 100;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanItems(items: CommerceItem[]) {
  return items
    .filter(
      (i) =>
        /^[A-Za-z0-9-]{1,64}$/.test(i.id) &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0 &&
        i.quantity <= 99,
    )
    .slice(0, 30)
    .map((i) => ({
      item_id: i.id,
      item_name: i.name.slice(0, 120),
      quantity: i.quantity,
      ...(Number.isInteger(i.priceMinor) && (i.priceMinor ?? -1) >= 0
        ? { price: major(i.priceMinor!) }
        : {}),
    }));
}

export const purchaseStorageKey = (orderId: string) =>
  `riway-purchase-tracked:${orderId}`;

/** Returns which providers received the event (for tests and debugging). */
export function sendCommerceEvent(event: CommerceEvent, env: Env) {
  const consent = readConsentCookie(env.cookie);
  const sent: string[] = [];
  if (!consent || (!consent.analytics && !consent.marketing)) return sent;
  if (!/^[A-Z]{3}$/.test(event.currency)) return sent;
  const items = cleanItems(event.items);
  if (!items.length) return sent;
  if (event.name === "purchase") {
    if (
      !uuidPattern.test(event.transactionId) ||
      !Number.isInteger(event.valueMinor) ||
      event.valueMinor <= 0
    )
      return sent;
    try {
      if (env.storage?.getItem(purchaseStorageKey(event.transactionId)))
        return sent;
      env.storage?.setItem(purchaseStorageKey(event.transactionId), "1");
    } catch {
      /* Storage may be blocked; providers still deduplicate by id. */
    }
  }
  const value =
    event.name === "purchase"
      ? major(event.valueMinor)
      : items.every((i) => "price" in i)
        ? items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0)
        : undefined;
  if (consent.analytics && env.gtag) {
    env.gtag("event", event.name, {
      currency: event.currency,
      ...(value !== undefined ? { value } : {}),
      ...(event.name === "purchase"
        ? { transaction_id: event.transactionId }
        : {}),
      items,
    });
    sent.push("ga4");
  }
  if (consent.marketing && env.fbq) {
    env.fbq(
      "track",
      pixelNames[event.name],
      {
        currency: event.currency,
        ...(value !== undefined ? { value } : {}),
        content_type: "product",
        content_ids: items.map((i) => i.item_id),
        num_items: items.reduce((n, i) => n + i.quantity, 0),
      },
      event.name === "purchase" ? { eventID: event.transactionId } : undefined,
    );
    sent.push("pixel");
  }
  return sent;
}

/** Browser entry point; a no-op on the server or without consent. */
export function trackCommerce(event: CommerceEvent) {
  if (typeof window === "undefined") return [];
  let storage: Env["storage"];
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  return sendCommerceEvent(event, {
    cookie: document.cookie,
    gtag: window.gtag,
    fbq: window.fbq,
    storage,
  });
}
