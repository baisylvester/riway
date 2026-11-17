import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ session: f.session }));
import {
  commerceQuoteSchema,
  quoteRequestSchema,
  quoteFingerprint,
} from "../../src/lib/commerce-checkout";
import { CheckoutQuote } from "../../src/components/checkout-quote";
import { POST } from "../../src/app/api/checkout/quote/route";
const product = "73000000-0000-4000-8000-000000000001",
  other = "73000000-0000-4000-8000-000000000002",
  offer = "73000000-0000-4000-8000-000000000003";
const input = {
  market: "PH",
  items: [{ productId: product, quantity: 3 }],
  promotionCode: "FIXTURE",
};
function quote() {
  return {
    market: "PH",
    currency: "PHP",
    items: [
      {
        productId: product,
        name: "Fixture <package>",
        quantity: 3,
        unitMinor: 100,
        grossMinor: 300,
        discountMinor: 1,
        netMinor: 299,
        packageOfferId: offer,
      },
    ],
    subtotalMinor: 300,
    discountMinor: 1,
    totalMinor: 299,
    promotion: { id: offer, name: "Fixture discount", code: "FIXTURE" },
    quoteHash: "a".repeat(64),
  };
}
const request = (
  body: unknown = input,
  origin = "https://riway.example.invalid",
) =>
  new Request("https://riway.example.invalid/api/checkout/quote", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.session.mockResolvedValue({ user: { id: other }, client: { rpc: f.rpc } });
  f.rpc.mockResolvedValue({ data: quote(), error: null });
});
describe("authoritative quote contract", () => {
  it("preserves a one-cent discount across three units without rounding the unit price", () => {
    const q = commerceQuoteSchema.parse(quote());
    const html = renderToStaticMarkup(<CheckoutQuote quote={q} />);
    expect(html).toContain("2.99");
    expect(html).toContain("× 3");
    expect(html).toContain("&lt;package&gt;");
    expect(html).not.toContain("Fixture <package>");
    expect(q.items[0].unitMinor).toBe(100);
  });
  it("allows a free eligible line alongside a positive charged line, and rejects an all-zero order", () => {
    const q = quote();
    q.items[0].discountMinor = 300;
    q.items[0].netMinor = 0;
    q.items.push({
      ...q.items[0],
      productId: other,
      discountMinor: 0,
      netMinor: 300,
    });
    q.subtotalMinor = 600;
    q.discountMinor = 300;
    q.totalMinor = 300;
    expect(commerceQuoteSchema.safeParse(q).success).toBe(true);
    q.items.pop();
    q.subtotalMinor = 300;
    q.totalMinor = 0;
    expect(commerceQuoteSchema.safeParse(q).success).toBe(false);
  });
  it("rejects mismatched line/totals/currency and duplicated product identities", () => {
    for (const change of [
      (q: ReturnType<typeof quote>) => {
        q.totalMinor = 300;
      },
      (q: ReturnType<typeof quote>) => {
        q.items[0].netMinor = 298;
      },
      (q: ReturnType<typeof quote>) => {
        q.items[0].grossMinor = 301;
      },
      (q: ReturnType<typeof quote>) => {
        q.items[0].discountMinor = -1;
      },
      (q: ReturnType<typeof quote>) => {
        q.currency = "SGD";
      },
      (q: ReturnType<typeof quote>) => {
        q.items.push(q.items[0]);
      },
    ]) {
      const q = quote();
      change(q);
      expect(commerceQuoteSchema.safeParse(q).success).toBe(false);
    }
  });
  it("normalizes voucher input and invalidates fingerprints when selections change", () => {
    expect(
      quoteRequestSchema.parse({ ...input, promotionCode: " fixture " })
        .promotionCode,
    ).toBe("FIXTURE");
    expect(quoteFingerprint("PH", input.items, " fixture ")).toBe(
      quoteFingerprint("PH", input.items, "FIXTURE"),
    );
    expect(
      quoteFingerprint("PH", [{ productId: product, quantity: 2 }], "FIXTURE"),
    ).not.toBe(quoteFingerprint("PH", input.items, "FIXTURE"));
    expect(
      quoteRequestSchema.safeParse({
        ...input,
        items: [...input.items, ...input.items],
      }).success,
    ).toBe(false);
  });
});
describe("quote HTTP authority", () => {
  it("rejects forged origins, malformed/oversized input and signed-out calls before RPC", async () => {
    expect((await POST(request(input, "https://evil.invalid"))).status).toBe(
      403,
    );
    expect((await POST(request({}))).status).toBe(400);
    expect(
      (await POST(request({ ...input, extra: "x".repeat(17000) }))).status,
    ).toBe(400);
    f.session.mockResolvedValue({ user: null });
    expect((await POST(request())).status).toBe(401);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("requests user-scoped prices and emits only a verified no-store quote", async () => {
    const response = await POST(
      request({ ...input, promotionCode: " fixture ", totalMinor: 1 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(f.rpc).toHaveBeenCalledWith("quote_commerce_checkout", {
      m: "PH",
      items: input.items,
      promotion_code: "FIXTURE",
    });
    expect((await response.json()).totalMinor).toBe(299);
  });
  it("rejects otherwise valid quotes for a different selection or voucher", async () => {
    const q = quote();
    q.items[0].productId = other;
    f.rpc.mockResolvedValue({ data: q, error: null });
    expect((await POST(request())).status).toBe(503);
    q.items[0].productId = product;
    q.promotion.code = "OTHER";
    expect((await POST(request())).status).toBe(503);
  });
  it("distinguishes missing setup and unavailable offers without leaking database details", async () => {
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "private fixture" },
    });
    expect((await POST(request())).status).toBe(503);
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "private fixture" },
    });
    const r = await POST(request());
    expect(r.status).toBe(409);
    expect(await r.text()).not.toContain("private fixture");
  });
  it("explains the one-membership-package rule instead of a generic refusal", async () => {
    f.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "Choose one qualifying membership package per order",
      },
    });
    const r = await POST(request());
    expect(r.status).toBe(409);
    expect(await r.text()).toContain(
      "Choose one qualifying membership package per order",
    );
  });
});
