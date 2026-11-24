import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { notificationConfiguration } from "../../src/lib/notification-config";
import { emailProvider } from "../../src/services/resend-email";

const configured = {
  NODE_ENV: "production",
  EMAIL_PROVIDER: "resend",
  EMAIL_DELIVERY_MODE: "test",
  RESEND_API_KEY: "re_disposable_fixture",
  RESEND_FROM_EMAIL: "sender@example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "disposable-fixture",
  NOTIFICATION_WORKER_SECRET: "x".repeat(32),
  EMAIL_TEST_RECIPIENTS: "recipient@example.invalid",
  NEXT_PUBLIC_SITE_URL: "https://shop.example.invalid",
};
afterEach(() => vi.unstubAllEnvs());
it.each([
  "sender@example.invalid",
  "RIWAY <sender@example.invalid>",
  "  RIWAY <sender@example.invalid>  ",
])(
  "accepts Resend sender syntax %s in the readiness check and provider",
  (RESEND_FROM_EMAIL) => {
    expect(
      notificationConfiguration({ ...configured, RESEND_FROM_EMAIL }).status,
    ).toBe("test");
    for (const [key, value] of Object.entries({
      ...configured,
      RESEND_FROM_EMAIL,
    }))
      vi.stubEnv(key, value);
    expect(() => emailProvider()).not.toThrow();
  },
);
it.each([
  "invalid",
  "<sender@example.invalid>",
  "RIWAY <invalid>",
  "RIWAY <sender@example.invalid>, Other <other@example.invalid>",
  "RIWAY\r\nBcc: victim@example.invalid <sender@example.invalid>",
  "RIWAY <sender@example.invalid>\n",
])(
  "rejects invalid or injected sender %j before constructing a provider",
  (RESEND_FROM_EMAIL) => {
    expect(
      notificationConfiguration({ ...configured, RESEND_FROM_EMAIL }).status,
    ).toBe("incomplete");
    for (const [key, value] of Object.entries({
      ...configured,
      RESEND_FROM_EMAIL,
    }))
      vi.stubEnv(key, value);
    expect(() => emailProvider()).toThrow();
  },
);
it("rejects null bytes in configuration objects", () => {
  // Operating-system environment variables truncate at NUL, so exercise this
  // boundary as an object rather than pretending the provider can receive it.
  expect(
    notificationConfiguration({
      ...configured,
      RESEND_FROM_EMAIL: "RIWAY <sender@example.invalid>\u0000",
    }).status,
  ).toBe("incomplete");
});
