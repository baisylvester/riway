import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { notificationContent } = await import("@/services/resend-email");

const orderId = "3f8a2c10-1111-4222-8333-444455556666";
const context = {
  orderId,
  market: "PH",
  currency: "PHP",
  subtotalMinor: 30000,
  discountMinor: 5000,
  totalMinor: 25000,
  placedAt: "2026-11-24",
  items: [
    { name: "Sample <b>product</b>", quantity: 2, netMinor: 20000 },
    { name: "Sample second product", quantity: 1, netMinor: 5000 },
  ],
};

describe("order confirmation email", () => {
  it("includes escaped bonus goods and their frozen return terms in both email formats", () => {
    const mail = notificationContent({
      type: "order_confirmed",
      reference: orderId,
      context: {
        ...context,
        bonusItems: [
          {
            name: "Bonus <script>goods</script>",
            quantity: 1,
            returnTerms: "Synthetic approved return terms <b>only</b>.",
          },
        ],
      },
    });
    expect(mail.text).toContain(
      "Bonus: Bonus <script>goods</script> × 1 | No additional charge",
    );
    expect(mail.html).toContain("Bonus &lt;script&gt;goods&lt;/script&gt;");
    expect(mail.html).toContain(
      "Synthetic approved return terms &lt;b&gt;only&lt;/b&gt;.",
    );
    expect(mail.html).not.toContain("<script>");
  });
  it("summarises the frozen snapshot, escapes names and links to the owned order", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.invalid");
    const mail = notificationContent({
      type: "order_confirmed",
      reference: orderId,
      context,
    });
    expect(mail.subject).toBe("RIWAY order 3F8A2C10 confirmed");
    expect(mail.text).toContain("Sample <b>product</b> × 2 | ₱200.00");
    expect(mail.text).toContain("Total paid ₱250.00");
    expect(mail.text).toContain("Discount −₱50.00");
    expect(mail.text).toContain(
      `https://shop.example.invalid/account/orders/${orderId}`,
    );
    expect(mail.text).toContain("not a tax invoice");
    expect(mail.text).toContain("No approved therapeutic claims");
    expect(mail.html).not.toContain("<b>product</b>");
    expect(mail.html).toContain("&lt;b&gt;product&lt;/b&gt;");
    vi.unstubAllEnvs();
  });

  it("omits PH-only statements for other markets", () => {
    const mail = notificationContent({
      type: "order_confirmed",
      reference: orderId,
      context: { ...context, market: "SG", currency: "SGD" },
    });
    expect(mail.text).not.toContain("therapeutic");
  });

  it("refuses mismatched references and malformed snapshots", () => {
    expect(() =>
      notificationContent({
        type: "order_confirmed",
        reference: "00000000-0000-4000-8000-000000000000",
        context,
      }),
    ).toThrow();
    expect(() =>
      notificationContent({
        type: "order_confirmed",
        reference: orderId,
        context: { ...context, items: [] },
      }),
    ).toThrow();
    expect(() =>
      notificationContent({
        type: "order_confirmed",
        reference: orderId,
        context: { ...context, totalMinor: -1 },
      }),
    ).toThrow();
  });
});

describe("corporate low-stock email", () => {
  it("lists checkout stock records and links to staff inventory", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.invalid");
    const mail = notificationContent({
      type: "corporate_low_stock",
      reference: "00000000-0000-4000-8000-000000000001",
      context: {
        market: "PH",
        day: "2026-11-24",
        lowStockCount: 1,
        items: [{ product: "Sample & product", available: 2, threshold: 5 }],
      },
    });
    expect(mail.subject).toBe("RIWAY low-stock alert · PH · 2026-11-24");
    expect(mail.text).toContain(
      "Sample & product | available: 2 | threshold: 5",
    );
    expect(mail.html).toContain("Sample &amp; product");
    expect(mail.text).toContain("https://shop.example.invalid/admin/inventory");
    vi.unstubAllEnvs();
  });

  it("rejects an empty report", () => {
    expect(() =>
      notificationContent({
        type: "corporate_low_stock",
        reference: "00000000-0000-4000-8000-000000000001",
        context: {
          market: "PH",
          day: "2026-11-24",
          lowStockCount: 0,
          items: [],
        },
      }),
    ).toThrow();
  });
});
