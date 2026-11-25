import { afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { notificationContent } from "@/services/resend-email";
afterEach(() => vi.unstubAllEnvs());
it("links transactional return updates to the private order without echoing reasons or claiming money on intake", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://riway.example.invalid");
  const context = {
    orderId: "93000000-0000-4000-8000-000000000001",
    stage: "received",
    reason: "private medical reason",
    providerId: "secret-reference",
  };
  const mail = notificationContent({
    type: "return_update",
    reference: "qa",
    context,
  });
  expect(mail.text).toContain("does not itself cancel or refund");
  expect(mail.text).toContain(
    "/account/orders/93000000-0000-4000-8000-000000000001",
  );
  expect(mail.text + mail.html).not.toContain("private medical");
  expect(mail.text + mail.html).not.toContain("secret-reference");
});
it("distinguishes provider processing from bank posting and requires the verified amount", () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://riway.example.invalid");
  const context = {
    orderId: "93000000-0000-4000-8000-000000000001",
    stage: "processed",
    amountMinor: 10001,
    currency: "PHP",
  };
  const mail = notificationContent({
    type: "return_update",
    reference: "qa",
    context,
  });
  expect(mail.text).toContain("₱100.01");
  expect(mail.text).toContain("Posting to your account depends");
  expect(() =>
    notificationContent({
      type: "return_update",
      reference: "qa",
      context: { ...context, amountMinor: undefined },
    }),
  ).toThrow();
});
