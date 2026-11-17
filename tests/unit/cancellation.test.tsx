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

import { cancelOrder } from "../../src/app/account/orders/actions";
import { CancelOrderForm } from "../../src/components/cancel-order-form";
import {
  cancellationProblem,
  cancellationRequestSchema,
  orderCancellationSchema,
} from "../../src/lib/cancellation";

const userId = "78000000-0000-4000-8000-000000000001";
const orderId = "78000000-0000-4000-8000-000000000002";
const at = "2026-11-17T09:00:00.123456+00:00";
const state = (over: Record<string, unknown> = {}) => ({
  orderId,
  status: "awaiting_payment",
  paymentStatus: "pending",
  cancellable: true,
  cancellation: null,
  ...over,
});
const cancelled = (cancelledBy = "customer", reason: string | null = null) =>
  state({
    status: "cancelled",
    cancellable: false,
    cancellation: { cancelledBy, reason, createdAt: at },
  });
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  f.session.mockResolvedValue({
    user: { id: userId },
    client: { rpc: f.rpc },
  });
  f.access.mockResolvedValue({
    user: { id: userId },
    allowed: true,
    mfa: true,
  });
});

describe("cancellation request schema", () => {
  it("lets customers omit a reason and normalises line breaks", () => {
    expect(
      cancellationRequestSchema.parse({ orderId, reason: "", staff: false })
        .reason,
    ).toBeNull();
    expect(
      cancellationRequestSchema.parse({
        orderId,
        reason: "  Duplicate\r\norder  ",
        staff: true,
      }).reason,
    ).toBe("Duplicate\norder");
  });

  it("requires a staff reason and refuses malformed ones", () => {
    for (const reason of ["", "abc", "Tab\there", "x".repeat(501)])
      expect(
        cancellationRequestSchema.safeParse({ orderId, reason, staff: true })
          .success,
      ).toBe(false);
    expect(
      cancellationRequestSchema.safeParse({ orderId: "nope", staff: false })
        .success,
    ).toBe(false);
  });

  it("parses RPC responses and rejects unknown actors", () => {
    expect(
      orderCancellationSchema.parse(cancelled("staff", "Duplicate")),
    ).toMatchObject({ cancellation: { cancelledBy: "staff" } });
    expect(orderCancellationSchema.safeParse(cancelled("robot")).success).toBe(
      false,
    );
  });
});

describe("cancellation messages", () => {
  it("maps database refusals to fixed messages", () => {
    expect(cancellationProblem("42501", undefined, true)).toMatch(/MFA/);
    expect(cancellationProblem("42501", undefined, false)).toMatch(
      /not available/,
    );
    expect(
      cancellationProblem(
        "40001",
        "Only unpaid orders can be cancelled online",
        false,
      ),
    ).toMatch(/Contact RIWAY support/);
    expect(
      cancellationProblem(
        "40001",
        "A payment has started for this order",
        true,
      ),
    ).toMatch(/Reconcile it in Payments/);
    expect(cancellationProblem("XX000", "secret internals", false)).toBe(
      "The order could not be cancelled. Reload and check the order.",
    );
  });
});

describe("cancelOrder action", () => {
  it("cancels a customer's order and revalidates order pages", async () => {
    f.rpc.mockResolvedValue({ data: cancelled(), error: null });
    const result = await cancelOrder(
      { message: "" },
      form({ orderId, confirmed: "on" }),
    );
    expect(result.ok).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("cancel_order", {
      p_order: orderId,
      p_reason: null,
    });
    expect(f.access).not.toHaveBeenCalled();
    expect(f.revalidate).toHaveBeenCalledWith(`/account/orders/${orderId}`);
  });

  it("requires confirmation, sign-in and staff MFA", async () => {
    expect(
      (await cancelOrder({ message: "" }, form({ orderId }))).message,
    ).toMatch(/Confirm/);
    f.access.mockResolvedValue({
      user: { id: userId },
      allowed: true,
      mfa: false,
    });
    expect(
      (
        await cancelOrder(
          { message: "" },
          form({
            orderId,
            staff: "1",
            reason: "Duplicate order",
            confirmed: "on",
          }),
        )
      ).message,
    ).toMatch(/authenticator/);
    f.session.mockResolvedValue({ user: null, client: { rpc: f.rpc } });
    expect(
      (await cancelOrder({ message: "" }, form({ orderId, confirmed: "on" })))
        .message,
    ).toMatch(/Sign in/);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("passes the staff reason and reports refusals without success", async () => {
    f.rpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "A payment has started for this order" },
    });
    const result = await cancelOrder(
      { message: "" },
      form({
        orderId,
        staff: "1",
        reason: " Duplicate order ",
        confirmed: "on",
      }),
    );
    expect(f.rpc).toHaveBeenCalledWith("cancel_order", {
      p_order: orderId,
      p_reason: "Duplicate order",
    });
    expect(result.ok).toBeUndefined();
    expect(result.message).toMatch(/Reconcile/);
  });

  it("does not report success for an unexpected response", async () => {
    f.rpc.mockResolvedValue({ data: state(), error: null });
    const result = await cancelOrder(
      { message: "" },
      form({ orderId, confirmed: "on" }),
    );
    expect(result.ok).toBeUndefined();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
});

describe("CancelOrderForm", () => {
  it("offers cancellation only while the order is cancellable", () => {
    const html = renderToStaticMarkup(
      <CancelOrderForm cancellation={state()} />,
    );
    expect(html).toContain("Cancel this order");
    expect(html).toContain("Reason (optional)");
    expect(html).not.toContain('name="staff"');
    expect(
      renderToStaticMarkup(
        <CancelOrderForm cancellation={state({ cancellable: false })} />,
      ),
    ).toBe("");
  });

  it("requires a reason from staff", () => {
    const html = renderToStaticMarkup(
      <CancelOrderForm cancellation={state()} staff />,
    );
    expect(html).toContain('name="staff"');
    expect(html).toMatch(/<textarea[^>]*required/);
  });

  it("shows who cancelled, with the reason only to staff", () => {
    const record = cancelled("staff", "Duplicate order");
    const customer = renderToStaticMarkup(
      <CancelOrderForm cancellation={record} />,
    );
    expect(customer).toContain("Cancelled by RIWAY");
    expect(customer).not.toContain("Duplicate order");
    expect(
      renderToStaticMarkup(<CancelOrderForm cancellation={record} staff />),
    ).toContain("Reason: Duplicate order");
  });
});
