import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationConfiguration } from "../../src/lib/notification-config";

const configured = {
  NODE_ENV: "production",
  EMAIL_PROVIDER: "resend",
  EMAIL_DELIVERY_MODE: "test",
  RESEND_API_KEY: "private-resend-key-never-render",
  RESEND_FROM_EMAIL: "inventory@example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "private-database-key-never-render",
  NOTIFICATION_WORKER_SECRET: "private-worker-key-with-at-least-32-characters",
  EMAIL_TEST_RECIPIENTS: "owner@example.invalid",
  NEXT_PUBLIC_SITE_URL: "https://riway.example.invalid",
};
afterEach(() => vi.unstubAllEnvs());

describe("notification configuration", () => {
  it("shows disabled delivery independently of configured credentials", () => {
    expect(
      notificationConfiguration({ ...configured, EMAIL_PROVIDER: "disabled" }),
    ).toMatchObject({ status: "disabled", issues: [] });
    expect(notificationConfiguration({}).status).toBe("disabled");
  });
  it("reports test/live configuration without claiming delivery or exposing secrets", () => {
    const result = notificationConfiguration(configured);
    expect(result).toMatchObject({
      status: "test",
      schedule: "09:00 Asia/Shanghai",
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(JSON.stringify(result)).not.toContain("owner@example.invalid");
    expect(
      notificationConfiguration({ ...configured, EMAIL_DELIVERY_MODE: "live" })
        .status,
    ).toBe("live");
  });
  it.each([
    { EMAIL_TEST_RECIPIENTS: "" },
    { EMAIL_TEST_RECIPIENTS: "owner@example.invalid,invalid" },
    { RESEND_API_KEY: "" },
    { RESEND_FROM_EMAIL: "invalid" },
    { RESEND_REPLY_TO: "invalid" },
    { SUPABASE_SERVICE_ROLE_KEY: "" },
    { NOTIFICATION_WORKER_SECRET: "short" },
    { NEXT_PUBLIC_SITE_URL: "http://external.example.invalid" },
    { NEXT_PUBLIC_SITE_URL: "https://user:password@example.invalid" },
    { LOW_INVENTORY_REPORT_TIMEZONE: "Invalid/Zone" },
    { LOW_INVENTORY_REPORT_HOUR: "24" },
    { LOW_INVENTORY_REPORT_HOUR: "1.5" },
    { EMAIL_DELIVERY_MODE: "invalid" },
  ])("blocks incomplete or invalid configuration %j", (overrides) => {
    expect(
      notificationConfiguration({ ...configured, ...overrides }).status,
    ).toBe("incomplete");
  });
  it("allows local tests but requires production for live sends", () => {
    expect(
      notificationConfiguration({
        ...configured,
        NODE_ENV: "development",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:4173",
      }).status,
    ).toBe("test");
    expect(
      notificationConfiguration({
        ...configured,
        NODE_ENV: "development",
        EMAIL_DELIVERY_MODE: "live",
      }).status,
    ).toBe("incomplete");
  });
});
