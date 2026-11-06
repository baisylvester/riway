import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: vi.fn() }));
vi.mock("../../src/services/resend-email", () => ({
  emailProvider: mocks.provider,
  notificationContent: vi.fn(),
  reportDate: () => "2026-11-06",
  EmailDeliveryError: class extends Error {},
}));
import { POST } from "../../src/app/api/internal/notifications/route";

const secret = "worker-test-secret-with-at-least-32-characters";
function request(token = secret) {
  return new Request(
    "https://riway.example.invalid/api/internal/notifications",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    NODE_ENV: "production",
    EMAIL_PROVIDER: "resend",
    EMAIL_DELIVERY_MODE: "test",
    NOTIFICATION_WORKER_SECRET: secret,
    NEXT_PUBLIC_SUPABASE_URL: "https://db.example.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    RESEND_API_KEY: "test-resend-key",
    RESEND_FROM_EMAIL: "inventory@example.invalid",
    RESEND_REPLY_TO: "",
    NEXT_PUBLIC_SITE_URL: "https://riway.example.invalid",
    EMAIL_TEST_RECIPIENTS: "owner@example.invalid",
    LOW_INVENTORY_REPORT_HOUR: "9",
    LOW_INVENTORY_REPORT_TIMEZONE: "Asia/Shanghai",
  }))
    vi.stubEnv(key, value);
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.provider.mockReturnValue({ send: vi.fn() });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "claim_notifications" ? [] : 0,
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe("notification worker preflight", () => {
  it("does not initialize or claim the queue for unauthorized requests", async () => {
    expect((await POST(request("wrong-secret"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    ["EMAIL_TEST_RECIPIENTS", ""],
    ["EMAIL_TEST_RECIPIENTS", "invalid"],
    ["RESEND_FROM_EMAIL", "invalid"],
    ["NEXT_PUBLIC_SITE_URL", "invalid"],
    ["LOW_INVENTORY_REPORT_TIMEZONE", "Invalid/Zone"],
  ])("preserves jobs and retries when %s is invalid", async (key, value) => {
    vi.stubEnv(key, value);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(secret);
  });
  it("processes the queue after valid test configuration", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_notifications");
    expect(await response.json()).toMatchObject({ processed: 0, sent: 0 });
  });
});
