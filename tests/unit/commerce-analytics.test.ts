import { describe, expect, it, vi } from "vitest";
import {
  purchaseStorageKey,
  sendCommerceEvent,
} from "@/lib/commerce-analytics";

const orderId = "3f8a2c10-1111-4222-8333-444455556666";
const productId = "4f8a2c10-1111-4222-8333-444455556666";
const item = {
  id: productId,
  name: "Sample product",
  quantity: 2,
  priceMinor: 1250,
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}
const env = (cookie: string) => ({
  cookie,
  gtag: vi.fn(),
  fbq: vi.fn(),
  storage: memoryStorage(),
});

describe("consent-aware commerce events", () => {
  it("sends nothing without a consent choice or after necessary-only/withdrawal", () => {
    for (const cookie of [
      "",
      "riway-consent=v1.a0.m0",
      "riway-consent=v0.a1.m1",
    ]) {
      const e = env(cookie);
      expect(
        sendCommerceEvent(
          { name: "view_item", currency: "PHP", items: [item] },
          e,
        ),
      ).toEqual([]);
      expect(e.gtag).not.toHaveBeenCalled();
      expect(e.fbq).not.toHaveBeenCalled();
    }
  });

  it("sends GA4 only with analytics consent and the Pixel only with marketing consent", () => {
    const analytics = env("riway-consent=v1.a1.m0");
    expect(
      sendCommerceEvent(
        { name: "add_to_cart", currency: "PHP", items: [item] },
        analytics,
      ),
    ).toEqual(["ga4"]);
    expect(analytics.gtag).toHaveBeenCalledWith("event", "add_to_cart", {
      currency: "PHP",
      value: 25,
      items: [
        {
          item_id: productId,
          item_name: "Sample product",
          quantity: 2,
          price: 12.5,
        },
      ],
    });
    expect(analytics.fbq).not.toHaveBeenCalled();
    const marketing = env("riway-consent=v1.a0.m1");
    expect(
      sendCommerceEvent(
        { name: "view_item", currency: "PHP", items: [item] },
        marketing,
      ),
    ).toEqual(["pixel"]);
    expect(marketing.fbq).toHaveBeenCalledWith(
      "track",
      "ViewContent",
      expect.objectContaining({
        content_ids: [productId],
        num_items: 2,
        value: 25,
      }),
      undefined,
    );
  });

  it("does nothing when consent exists but the provider script was not started", () => {
    expect(
      sendCommerceEvent(
        { name: "view_item", currency: "PHP", items: [item] },
        { cookie: "riway-consent=v1.a1.m1" },
      ),
    ).toEqual([]);
  });

  it("omits value when any price is unknown and drops malformed items", () => {
    const e = env("riway-consent=v1.a1.m0");
    sendCommerceEvent(
      {
        name: "begin_checkout",
        currency: "PHP",
        items: [
          { id: productId, name: "", quantity: 1 },
          { id: "bad id <script>", name: "x", quantity: 1 },
          { id: productId, name: "y", quantity: 0 },
        ],
      },
      e,
    );
    const payload = e.gtag.mock.calls[0][2];
    expect(payload).not.toHaveProperty("value");
    expect(payload.items).toHaveLength(1);
  });

  it("reports a purchase once per order with a dedup id and no personal data", () => {
    const e = env("riway-consent=v1.a1.m1");
    const purchase = {
      name: "purchase" as const,
      currency: "PHP",
      transactionId: orderId,
      valueMinor: 2500,
      items: [item],
    };
    expect(sendCommerceEvent(purchase, e)).toEqual(["ga4", "pixel"]);
    expect(sendCommerceEvent(purchase, e)).toEqual([]);
    expect(e.storage.getItem(purchaseStorageKey(orderId))).toBe("1");
    expect(e.gtag).toHaveBeenCalledWith(
      "event",
      "purchase",
      expect.objectContaining({ transaction_id: orderId, value: 25 }),
    );
    expect(e.fbq).toHaveBeenCalledWith(
      "track",
      "Purchase",
      expect.objectContaining({ value: 25 }),
      { eventID: orderId },
    );
    const sent = JSON.stringify([e.gtag.mock.calls, e.fbq.mock.calls]);
    expect(sent).not.toMatch(/@|email|phone|address/i);
  });

  it("refuses malformed purchases", () => {
    const e = env("riway-consent=v1.a1.m1");
    for (const bad of [
      { transactionId: "not-a-uuid", valueMinor: 100 },
      { transactionId: orderId, valueMinor: 0 },
      { transactionId: orderId, valueMinor: 1.5 },
    ])
      expect(
        sendCommerceEvent(
          { name: "purchase", currency: "PHP", items: [item], ...bad },
          e,
        ),
      ).toEqual([]);
    expect(
      sendCommerceEvent(
        {
          name: "purchase",
          currency: "php",
          transactionId: orderId,
          valueMinor: 10,
          items: [item],
        },
        e,
      ),
    ).toEqual([]);
  });

  it("still sends when storage is blocked", () => {
    const e = {
      ...env("riway-consent=v1.a1.m0"),
      storage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(
      sendCommerceEvent(
        {
          name: "purchase",
          currency: "PHP",
          transactionId: orderId,
          valueMinor: 10,
          items: [item],
        },
        e,
      ),
    ).toEqual(["ga4"]);
  });
});
