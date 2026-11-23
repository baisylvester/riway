import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PaymentMethodPicker,
  allowedPaymentRedirect,
  selectionPayload,
} from "../../src/components/payment-method";
import { OrderPayment } from "../../src/components/order-payment";
import { xenditChannels } from "../../src/lib/xendit-channels";

const ph = xenditChannels.PH.filter((c) =>
  [
    "GCASH",
    "PAYMAYA",
    "BPI_ONLINE_BANKING",
    "BDO_ONLINE_BANKING",
    "QRPH",
  ].includes(c.code),
);
const picker = (
  value: Parameters<typeof PaymentMethodPicker>[0]["value"],
  total = 100000,
) =>
  renderToStaticMarkup(
    <PaymentMethodPicker
      gateways={["stripe", "xendit"]}
      channels={ph}
      totalMinor={total}
      value={value}
      onChange={vi.fn()}
    />,
  );

describe("payment method picker", () => {
  it("lets the customer choose the gateway, then the method", () => {
    const html = picker({ gateway: "xendit", group: null, channel: null });
    expect(html).toContain("Card via Stripe");
    expect(html).toContain("E-wallet");
    expect(html).toContain("Online banking");
    expect(html).not.toContain("Choose your bank");
  });
  it("shows a bank selector only for bank-selection methods", () => {
    const bank = picker({
      gateway: "xendit",
      group: "ONLINE_BANKING",
      channel: null,
    });
    expect(bank).toContain("Choose your bank");
    expect(bank).toContain("BPI");
    expect(bank).toContain("never sees or stores your bank login");
    const wallet = picker({
      gateway: "xendit",
      group: "EWALLET",
      channel: null,
    });
    expect(wallet).not.toContain("Choose your bank");
    expect(wallet).toContain("GCash");
  });
  it("hides methods the order total cannot use", () => {
    // QR Ph is capped at PHP 50,000.00.
    expect(
      picker({ gateway: "xendit", group: null, channel: null }, 6_000_000),
    ).not.toContain("QR payment");
  });
  it("sends only a complete selection", () => {
    expect(selectionPayload({ gateway: "xendit", channel: null })).toBeNull();
    expect(selectionPayload({ gateway: "xendit", channel: "GCASH" })).toEqual({
      gateway: "xendit",
      channel: "GCASH",
    });
    expect(selectionPayload({ gateway: "stripe", channel: "GCASH" })).toEqual({
      gateway: "stripe",
    });
  });
  it("redirects only to the site, Stripe or Xendit checkout", () => {
    const origin = "https://riway.example.invalid";
    expect(
      allowedPaymentRedirect(
        "https://checkout-staging.xendit.co/sessions/ps-1",
        origin,
      ),
    ).toBeTruthy();
    expect(allowedPaymentRedirect("/account/orders/1", origin)).toBe(
      `${origin}/account/orders/1`,
    );
    expect(allowedPaymentRedirect("https://evil.example/x", origin)).toBeNull();
    expect(
      allowedPaymentRedirect("https://checkout.xendit.co:8443/x", origin),
    ).toBeNull();
  });
});

describe("order payment states", () => {
  const render = (phase: string, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      <OrderPayment
        orderId="o"
        gateway="xendit"
        phase={phase}
        mode={false}
        channel="GCash"
        enabled
        {...extra}
      />,
    );
  it("never treats returning from Xendit as paid", () => {
    const html = render("open", { returned: true });
    expect(html).toContain("waiting for Xendit to confirm");
    expect(html).not.toContain("Payment confirmed");
    expect(html).toContain("Resume secure payment");
  });
  it("describes each server-verified state", () => {
    expect(render("paid")).toContain("Payment confirmed");
    expect(render("paid")).not.toContain("Resume secure payment");
    expect(render("expired")).toContain("expired");
    expect(render("canceled")).toContain("cancelled");
    expect(render("review")).toContain("do not pay again");
  });
  it("offers a channel switch only while payment is open", () => {
    const channels = [
      { code: "GCASH", label: "GCash" },
      { code: "BPI_ONLINE_BANKING", label: "BPI" },
    ];
    expect(render("open", { channels })).toContain("Switch payment method");
    expect(render("paid", { channels })).not.toContain("Switch payment method");
  });
});
