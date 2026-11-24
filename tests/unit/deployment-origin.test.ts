import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { siteOrigin } from "../../src/lib/seo";
import { stripeConfiguration } from "../../src/lib/stripe-config";
import { xenditConfiguration } from "../../src/lib/xendit-config";
import { notificationConfiguration } from "../../src/lib/notification-config";
import { notificationContent } from "../../src/services/resend-email";

const production = "https://riway-platform.pages.dev";
const staging = "https://riway-platform-staging.pages.dev";
const paymentEnv = {
  NEXT_PUBLIC_SITE_URL: production,
  SITE_URL: staging,
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "disposable-fixture",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
  XENDIT_SECRET_KEY: "xnd_development_fixture",
  XENDIT_WEBHOOK_TOKEN: "fixture-token-long-enough",
};
afterEach(() => vi.unstubAllEnvs());

describe("promoting one build between environments", () => {
  it("uses the deployment origin for metadata and distributor links", () => {
    expect(siteOrigin(paymentEnv)).toBe(staging);
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: production })).toBe(production);
  });

  it.each([
    ["Stripe", stripeConfiguration],
    ["Xendit", xenditConfiguration],
  ])(
    "%s returns customers to the environment that created the payment",
    (_, configure) => {
      expect(configure(paymentEnv).site).toBe(staging);
    },
  );

  it.each([
    "http://external.example.invalid",
    "https://user:password@staging.example.invalid",
    "https://staging.example.invalid/path",
  ])("refuses invalid runtime payment origins: %s", (SITE_URL) => {
    expect(() => stripeConfiguration({ ...paymentEnv, SITE_URL })).toThrow();
    expect(() => xenditConfiguration({ ...paymentEnv, SITE_URL })).toThrow();
  });

  it.each([
    "order_shipped",
    "order_delivered",
    "membership_requested",
    "membership_confirmed",
    "store_owner_onboarding",
  ] as const)("%s email links use the deployment origin", (type) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", production);
    vi.stubEnv("SITE_URL", staging);
    const reference = "3f8a2c10-1111-4222-8333-444455556666";
    const mail = notificationContent(
      type === "store_owner_onboarding"
        ? {
            type,
            reference,
            tenantId: reference,
            context: { store: "Disposable test store" },
          }
        : { type, reference },
    );
    expect(mail.text).toContain(staging);
    expect(mail.html).toContain(staging);
    expect(mail.text).not.toContain(production);
  });

  it("validates the runtime email origin before any notification is claimed", () => {
    const result = notificationConfiguration({
      ...paymentEnv,
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      EMAIL_DELIVERY_MODE: "test",
      RESEND_API_KEY: "disposable-fixture",
      RESEND_FROM_EMAIL: "sender@example.invalid",
      EMAIL_TEST_RECIPIENTS: "recipient@example.invalid",
      NOTIFICATION_WORKER_SECRET: "x".repeat(32),
      SITE_URL: "https://user:password@staging.example.invalid",
    });
    expect(result.status).toBe("incomplete");
    expect(result.issues).toContain("Configure a valid HTTPS website URL.");
  });
});
