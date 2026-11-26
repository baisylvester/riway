import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { notificationContent } from "@/services/resend-email";
it("links to an authenticated review, discloses no automatic order/charge and supports one-click opt-out", () => {
  const id = "88000000-0000-4000-8000-000000000001",
    token = "88000000-0000-4000-8000-000000000002";
  const message = notificationContent({
    type: "reorder_reminder",
    reference: id,
    context: { orderId: id, market: "PH", unsubscribeToken: token },
  });
  expect(message.text).toContain(`/account/orders/${id}`);
  expect(message.text).toContain("does not place an order");
  expect(message.text).toContain("No approved therapeutic claims");
  expect(message.headers?.["List-Unsubscribe"]).toContain(
    `/api/preferences/unsubscribe?token=${token}`,
  );
  expect(message.headers?.["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
});
