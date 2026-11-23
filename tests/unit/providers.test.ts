import { describe, it, expect, vi } from "vitest";
import type { Resend } from "resend";
vi.mock("server-only", () => ({}));
import {
  ResendTransactionalEmailProvider,
  notificationContent,
  reportDate,
} from "../../src/services/resend-email";
import { R2EditorialStorage } from "../../src/services/r2-storage";
import { secondFactorVerified } from "../../src/lib/auth-config";
import { limitedText } from "../../src/lib/request-body";

const message = {
  to: ["test@example.invalid"],
  idempotencyKey: "support/123",
  subject: "Support",
  html: "<p>Received</p>",
  text: "Received",
};
function emailClient(send: ReturnType<typeof vi.fn>) {
  return { emails: { send } } as unknown as Pick<Resend, "emails">;
}
describe("transactional email boundary", () => {
  it("sends actual SDK idempotency options and retries temporary errors with the same key", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ error: { statusCode: 429 } })
      .mockResolvedValue({ data: { id: "message-1" } });
    const provider = new ResendTransactionalEmailProvider(
      emailClient(send),
      "sender@example.invalid",
      "test",
      message.to,
      async () => {},
    );
    expect(await provider.send(message)).toEqual({
      providerMessageId: "message-1",
    });
    expect(send).toHaveBeenCalledTimes(2);
    for (const call of send.mock.calls)
      expect(call[1].idempotencyKey).toBe(message.idempotencyKey);
  });
  it("rejects unapproved test recipients before contacting Resend", async () => {
    const send = vi.fn();
    const provider = new ResendTransactionalEmailProvider(
      emailClient(send),
      "sender@example.invalid",
      "test",
      [],
    );
    await expect(provider.send(message)).rejects.toThrow("allowlist");
    expect(send).not.toHaveBeenCalled();
  });
  it("redacts permanent errors and does not retry them", async () => {
    const send = vi.fn().mockResolvedValue({
      error: { statusCode: 422, message: "sensitive provider body" },
    });
    const provider = new ResendTransactionalEmailProvider(
      emailClient(send),
      "sender@example.invalid",
      "test",
      message.to,
    );
    await expect(provider.send(message)).rejects.toThrow(
      "Email delivery is unavailable",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("keeps untrusted reference strings out of email HTML", () => {
    expect(
      notificationContent({ type: "support_received", reference: "<script>" })
        .html,
    ).not.toContain("<script>");
  });
});
describe("private media boundary", () => {
  it("rejects traversal and unsupported images before issuing storage commands", async () => {
    const send = vi.fn();
    const storage = new R2EditorialStorage({ send } as never, "private");
    await expect(
      storage.put("../private.txt", new Uint8Array([1]), "image/png"),
    ).rejects.toThrow();
    await expect(
      storage.put(
        "PH/40000000-0000-4000-8000-000000000001.png",
        new Uint8Array(3145729),
        "image/png",
      ),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("uploads with private caching and overwrite protection", async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new R2EditorialStorage({ send } as never, "private");
    await storage.put(
      "PH/40000000-0000-4000-8000-000000000001.png",
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    );
    expect(send.mock.calls[0][0].input).toMatchObject({
      CacheControl: "private, no-store",
      IfNoneMatch: "*",
      Bucket: "private",
    });
  });
});
it("requires a recent numeric second-factor claim", () => {
  expect(secondFactorVerified({ fva: [0, 1] })).toBe(true);
  for (const fva of [[0, -1], [0, 16], [0, "1"], undefined])
    expect(secondFactorVerified({ fva })).toBe(false);
});
it("caps webhook streams even without a content-length header", async () => {
  const request = new Request("https://example.invalid", {
    method: "POST",
    body: "oversized",
  });
  await expect(limitedText(request, 3)).rejects.toThrow("Payload too large");
});
it("escapes store and stock data in onboarding and low-inventory messages", () => {
  const tenantId = "40000000-0000-4000-8000-000000000001";
  const welcome = notificationContent({
    type: "store_owner_onboarding",
    reference: tenantId,
    tenantId,
    context: { store: "Store <script>" },
  });
  expect(welcome.html).toContain("Store &lt;script&gt;");
  expect(welcome.html).not.toContain("Store <script>");
  const report = notificationContent({
    type: "low_inventory_report",
    reference: tenantId,
    tenantId,
    context: {
      store: "Test store",
      day: "2026-11-05",
      lowStockCount: 1,
      items: [{ sku: "TEST", location: "<img>", available: 2, threshold: 5 }],
    },
  });
  expect(report.html).toContain("&lt;img&gt;");
  expect(report.text).toContain("available: 2");
});
it("uses the configured local hour for daily inventory reports", () => {
  expect(reportDate(new Date("2026-11-05T00:59:00Z"))).toBeNull();
  expect(reportDate(new Date("2026-11-05T01:00:00Z"))).toBe("2026-11-05");
});
