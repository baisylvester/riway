import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));

import { advanceOrderFulfilment } from "../../src/app/admin/fulfilment-actions";
import { FulfilmentForm } from "../../src/components/fulfilment-form";
import { FulfilmentTimeline } from "../../src/components/fulfilment-timeline";
import {
  fulfilmentRequestSchema,
  orderFulfilmentSchema,
} from "../../src/lib/fulfilment";
import { notificationContent } from "../../src/services/resend-email";

const userId = "77000000-0000-4000-8000-000000000001";
const orderId = "77000000-0000-4000-8000-000000000002";
const at = "2026-11-17T06:30:00.123456+00:00";
const fulfilment = (status = "fulfilling", events: unknown[] = []) => ({
  orderId,
  market: "PH",
  status,
  paymentStatus: "paid",
  events,
});
const packed = {
  fromStatus: "paid",
  toStatus: "fulfilling",
  method: null,
  carrier: null,
  trackingNumber: null,
  trackingUrl: null,
  note: "Packed",
  createdAt: at,
};
const dispatched = {
  fromStatus: "fulfilling",
  toStatus: "shipped",
  method: "courier",
  carrier: "Fixture Courier",
  trackingNumber: "QA123456",
  trackingUrl: "https://tracking.example.invalid/QA123456",
  note: null,
  createdAt: at,
};
function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
const dispatch = (extra: Record<string, string> = {}) =>
  form({
    orderId,
    status: "shipped",
    method: "courier",
    carrier: "Fixture Courier",
    trackingNumber: "QA123456",
    trackingUrl: "https://tracking.example.invalid/QA123456",
    note: "",
    confirmed: "on",
    ...extra,
  });

beforeEach(() => {
  vi.clearAllMocks();
  f.access.mockResolvedValue({ user: { id: userId }, allowed: true, mfa: true });
  f.session.mockResolvedValue({ client: { rpc: f.rpc }, user: { id: userId } });
});

describe("fulfilment request rules", () => {
  it("mirrors the database dispatch requirements", () => {
    const base = { orderId, status: "shipped" as const };
    expect(fulfilmentRequestSchema.safeParse(base).success).toBe(false);
    expect(
      fulfilmentRequestSchema.safeParse({ ...base, method: "courier", carrier: "Fixture" })
        .success,
    ).toBe(false);
    expect(
      fulfilmentRequestSchema.safeParse({
        ...base,
        method: "courier",
        carrier: "Fixture",
        trackingNumber: "QA123456",
        trackingUrl: "http://tracking.example.invalid",
      }).success,
    ).toBe(false);
    expect(
      fulfilmentRequestSchema.safeParse({
        ...base,
        method: "collection",
        note: "Manila service centre",
        carrier: "Fixture",
      }).success,
    ).toBe(false);
    expect(
      fulfilmentRequestSchema.safeParse({
        ...base,
        method: "collection",
        note: "Manila service centre",
      }).success,
    ).toBe(true);
    expect(
      fulfilmentRequestSchema.safeParse({
        orderId,
        status: "fulfilling",
        trackingNumber: "QA123456",
      }).success,
    ).toBe(false);
    expect(
      fulfilmentRequestSchema.safeParse({
        orderId,
        status: "fulfilling",
        note: "Line one\u0007",
      }).success,
    ).toBe(false);
  });

  it("keeps line breaks in notes and normalises browser CRLF", () => {
    const parsed = fulfilmentRequestSchema.parse({
      orderId,
      status: "shipped",
      method: "collection",
      note: "Manila service centre\r\nOpen 9am to 5pm\r\n",
    });
    expect(parsed.note).toBe("Manila service centre\nOpen 9am to 5pm");
    expect(
      fulfilmentRequestSchema.safeParse({
        orderId,
        status: "fulfilling",
        note: "Tab\there",
      }).success,
    ).toBe(false);
  });
});

describe("fulfilment action", () => {
  it.each([
    { user: null, allowed: false, mfa: false },
    { user: { id: userId }, allowed: false, mfa: true },
    { user: { id: userId }, allowed: true, mfa: false },
  ])("does not write without staff identity, role and MFA: %j", async (access) => {
    f.access.mockResolvedValue(access);
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).ok).not.toBe(
      true,
    );
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation and valid dispatch details before writing", async () => {
    const unconfirmed = dispatch();
    unconfirmed.delete("confirmed");
    await advanceOrderFulfilment({ message: "" }, unconfirmed);
    await advanceOrderFulfilment({ message: "" }, dispatch({ trackingNumber: "" }));
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("sends the exact step and verifies the returned status", async () => {
    f.rpc.mockResolvedValueOnce({
      data: fulfilment("fulfilling", [packed]),
      error: null,
    });
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).ok).not.toBe(
      true,
    );
    f.rpc.mockResolvedValueOnce({
      data: fulfilment("shipped", [packed, dispatched]),
      error: null,
    });
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).ok).toBe(
      true,
    );
    expect(f.rpc).toHaveBeenLastCalledWith("advance_order_fulfilment", {
      p_order: orderId,
      p_status: "shipped",
      p_method: "courier",
      p_carrier: "Fixture Courier",
      p_tracking_number: "QA123456",
      p_tracking_url: "https://tracking.example.invalid/QA123456",
      p_note: null,
    });
    expect(f.revalidate).toHaveBeenCalledWith(`/account/orders/${orderId}`);
  });

  it("treats a replay after the order moved on as already recorded", async () => {
    f.rpc.mockResolvedValueOnce({
      data: fulfilment("delivered", [
        packed,
        dispatched,
        { ...packed, fromStatus: "shipped", toStatus: "delivered", note: null },
      ]),
      error: null,
    });
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).ok).toBe(true);
  });

  it("explains database refusals without leaking other details", async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "x" } });
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).message).toContain(
      "moved on",
    );
    f.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Only paid orders can be fulfilled" },
    });
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).message).toBe(
      "Only paid orders can be fulfilled.",
    );
    f.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "private fixture detail" },
    });
    const generic = await advanceOrderFulfilment({ message: "" }, dispatch());
    expect(generic.message).not.toContain("private fixture");
    f.rpc.mockRejectedValueOnce(new Error("transport"));
    expect((await advanceOrderFulfilment({ message: "" }, dispatch())).message).toContain(
      "Please retry",
    );
  });
});

describe("fulfilment display", () => {
  it("shows tracking details safely and offers only the next valid step", () => {
    const parsed = orderFulfilmentSchema.parse(
      fulfilment("shipped", [packed, { ...dispatched, carrier: "<b>Courier</b>" }]),
    );
    const timeline = renderToStaticMarkup(<FulfilmentTimeline fulfilment={parsed} />);
    expect(timeline).toContain("Tracking QA123456");
    expect(timeline).toContain('rel="noopener noreferrer nofollow"');
    expect(timeline).toContain("&lt;b&gt;Courier&lt;/b&gt;");
    const form = renderToStaticMarkup(<FulfilmentForm fulfilment={parsed} />);
    expect(form).toContain('value="delivered"');
    expect(form).not.toContain("trackingNumber");
  });

  it("offers no step for unpaid or completed orders", () => {
    for (const value of [
      { ...fulfilment("awaiting_payment"), paymentStatus: "pending" },
      fulfilment("delivered", [packed]),
      { ...fulfilment("cancelled"), paymentStatus: "paid" },
    ]) {
      const html = renderToStaticMarkup(
        <FulfilmentForm fulfilment={orderFulfilmentSchema.parse(value)} />,
      );
      expect(html).not.toContain("<form");
    }
  });

  it("rejects non-https tracking links in responses", () => {
    expect(
      orderFulfilmentSchema.safeParse(
        fulfilment("shipped", [packed, { ...dispatched, trackingUrl: "javascript:alert(1)" }]),
      ).success,
    ).toBe(false);
  });

  it("keeps tracking details out of shipping emails", () => {
    for (const type of ["order_shipped", "order_delivered"] as const) {
      const content = notificationContent({ type, reference: orderId });
      expect(content.text).toContain("/account/orders");
      expect(content.text).not.toContain("QA123456");
    }
  });
});
