import { it, expect, vi } from "vitest";
import { runNotificationSchedule } from "../../deployment/scheduled-notifications";
it("keeps scheduled sends dormant while email is disabled", async () => {
  const fetch = vi.fn();
  await runNotificationSchedule({
    EMAIL_PROVIDER: "disabled",
    WORKER_SELF_REFERENCE: { fetch },
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("calls the internal service binding with the configured worker secret", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  await runNotificationSchedule({
    EMAIL_PROVIDER: "resend",
    NOTIFICATION_WORKER_SECRET: "test-worker-secret-with-at-least-32-chars",
    NEXT_PUBLIC_SITE_URL: "https://riway-platform.pages.dev",
    WORKER_SELF_REFERENCE: { fetch },
  });
  const request = fetch.mock.calls[0][0] as Request;
  expect(request.url).toBe(
    "https://riway-platform.pages.dev/api/internal/notifications",
  );
  expect(request.method).toBe("POST");
  expect(request.headers.get("authorization")).toBe(
    "Bearer test-worker-secret-with-at-least-32-chars",
  );
});
it("surfaces worker failures without including the secret", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  await expect(
    runNotificationSchedule({
      EMAIL_PROVIDER: "resend",
      NOTIFICATION_WORKER_SECRET: "test-worker-secret-with-at-least-32-chars",
      NEXT_PUBLIC_SITE_URL: "https://riway-platform.pages.dev",
      WORKER_SELF_REFERENCE: { fetch },
    }),
  ).rejects.toThrow("HTTP 503");
});
