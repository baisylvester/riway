import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  stores: vi.fn(),
  assurance: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/data", () => ({ requireSession: mocks.session }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("../../src/components/auth-panel", () => ({
  SecurityPanel: () => null,
}));
vi.mock("../../src/components/inventory-forms", () => ({
  InventorySetupForm: () => null,
  StockMovementForm: () => null,
  StockThresholdForm: () => null,
}));
import Operations from "../../src/app/operations/page";
import { InventoryEmailStatus } from "../../src/components/inventory-email-status";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  vi.stubEnv("EMAIL_PROVIDER", "disabled");
  vi.stubEnv(
    "NOTIFICATION_WORKER_SECRET",
    "never-expose-this-private-worker-secret",
  );
  vi.stubEnv("RESEND_API_KEY", "never-expose-this-private-sending-key");
  mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal2" } });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.stores.mockResolvedValue({ data: [], error: null });
  mocks.session.mockResolvedValue({
    user: { id: "70000000-0000-4000-8000-000000000001" },
    client: {
      auth: { mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } },
      rpc: mocks.rpc,
      from: () => ({ select: () => ({ order: mocks.stores }) }),
    },
  });
});
afterEach(() => vi.unstubAllEnvs());
it("shows email setup to an MFA-verified super admin before the first store exists", async () => {
  const html = renderToStaticMarkup(
    await Operations({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Inventory email reports");
  expect(html).toContain("Email delivery is disabled");
  expect(html).not.toContain("never-expose");
});
it("keeps provider configuration hidden from an ordinary account", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  expect(
    renderToStaticMarkup(
      await Operations({ searchParams: Promise.resolve({}) }),
    ),
  ).not.toContain("Inventory email reports");
});
it("does not load admin or store data before authenticator verification", async () => {
  mocks.assurance.mockResolvedValue({ data: { currentLevel: "aal1" } });
  const html = renderToStaticMarkup(
    await Operations({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Verify your authenticator");
  expect(html).not.toContain("Inventory email reports");
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.stores).not.toHaveBeenCalled();
});
it("does not present test configuration as verified delivery", () => {
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("EMAIL_DELIVERY_MODE", "test");
  vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.invalid");
  vi.stubEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "never-expose-this-private-database-key",
  );
  vi.stubEnv("EMAIL_TEST_RECIPIENTS", "owner@example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://riway.example.invalid");
  const html = renderToStaticMarkup(createElement(InventoryEmailStatus));
  expect(html).toContain("configured in test mode");
  expect(html).toContain("successful test delivery must be confirmed");
  expect(html).not.toContain("owner@example.invalid");
  expect(html).not.toContain("never-expose");
});
