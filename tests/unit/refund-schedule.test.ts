import { it, expect, vi } from "vitest";
import { runRefundSchedule } from "../../deployment/scheduled-refunds";
const secret = "synthetic-test-refund-worker-secret";
it("keeps the existing cron dormant for refunds until enabled", async () => {
  const fetch = vi.fn();
  await runRefundSchedule({ WORKER_SELF_REFERENCE: { fetch } });
  expect(fetch).not.toHaveBeenCalled();
});
it("uses the internal binding and separate refund secret", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  await runRefundSchedule({
    REFUNDS_ENABLED: "true",
    REFUND_WORKER_SECRET: secret,
    NEXT_PUBLIC_SITE_URL: "https://shop.example.invalid",
    WORKER_SELF_REFERENCE: { fetch },
  });
  const request = fetch.mock.calls[0][0] as Request;
  expect(request.url).toBe("https://shop.example.invalid/api/internal/refunds");
  expect(request.method).toBe("POST");
  expect(request.headers.get("Authorization")).toBe(`Bearer ${secret}`);
});
it("refuses incomplete configuration and credential-bearing targets before sending", async () => {
  const fetch = vi.fn();
  await expect(runRefundSchedule({ REFUNDS_ENABLED: "true" })).rejects.toThrow(
    "incomplete",
  );
  await expect(
    runRefundSchedule({
      REFUNDS_ENABLED: "true",
      REFUND_WORKER_SECRET: secret,
      NEXT_PUBLIC_SITE_URL: "https://user:password@shop.example.invalid",
      WORKER_SELF_REFERENCE: { fetch },
    }),
  ).rejects.toThrow("Invalid");
  expect(fetch).not.toHaveBeenCalled();
});
it("surfaces reconciliation failures without exposing the bearer secret", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  await expect(
    runRefundSchedule({
      REFUNDS_ENABLED: "true",
      REFUND_WORKER_SECRET: secret,
      NEXT_PUBLIC_SITE_URL: "https://shop.example.invalid",
      WORKER_SELF_REFERENCE: { fetch },
    }),
  ).rejects.toThrow("HTTP 503");
});
