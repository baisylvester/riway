import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const f = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  start: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ session: f.session }));
vi.mock("@/lib/referral-continuity", () => ({
  completePendingReferral: vi.fn(async () => ({ state: "none" })),
}));
vi.mock("@/lib/stripe-config", () => ({
  stripeReadiness: vi.fn(() => ({ enabled: true })),
}));
vi.mock("@/services/stripe-payments", () => ({
  paymentClients: vi.fn(() => ({ config: { terms: "sale-v1" } })),
  startStripeCheckout: f.start,
}));
import { POST } from "../../src/app/api/checkout/route";
import { commerceQuoteSchema } from "../../src/lib/commerce-checkout";
import { sampleMembershipPackages } from "../../src/lib/membership-sample";
import { MembershipConsentFields } from "../../src/components/membership-consent";
import { notificationContent } from "../../src/services/resend-email";

const qualification = sampleMembershipPackages[0].qualification;
const userId = "92000000-0000-4000-8000-000000000001";
const orderId = "92000000-0000-4000-8000-000000000002";
const consent = {
  ruleId: qualification.ruleId,
  termsVersion: qualification.termsVersion,
  codeVersion: qualification.codeVersion,
  accepted: true,
};
const input = {
  market: "PH",
  items: [{ productId: qualification.productId, quantity: 1 }],
  address: {
    full_name: "Fixture buyer",
    phone: "0000000000",
    line1: "Fixture address",
    city: "Manila",
    postal_code: "1000",
    country: "PH",
  },
  terms: true,
  termsVersion: "sale-v1",
  idempotencyKey: orderId,
  quoteHash: "a".repeat(64),
  membershipConsent: consent,
};
function request(body: unknown) {
  return new Request("https://riway.example.invalid/api/checkout", {
    method: "POST",
    headers: {
      origin: "https://riway.example.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMENT_PROVIDER", "stripe");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://riway.example.invalid");
  f.session.mockResolvedValue({
    user: { id: userId },
    contactVerified: true,
    client: { rpc: f.rpc },
  });
  f.rpc.mockResolvedValue({ data: orderId, error: null });
  f.start.mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay/fixture",
  });
});

describe("membership checkout boundary", () => {
  it("forwards only explicit consent identities to the user-scoped transactional order", async () => {
    expect((await POST(request(input))).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith(
      "create_membership_commerce_order",
      expect.objectContaining({
        membership_consent: consent,
        quote_hash: input.quoteHash,
      }),
    );
    expect(f.start).toHaveBeenCalledWith(orderId, userId, expect.any(Object));
  });
  it.each([
    { ...consent, accepted: false },
    { ...consent, tier: "ADMIN" },
    { ...consent, termsText: "Client replacement document" },
    { ...consent, ruleId: "not-a-rule" },
  ])(
    "rejects invalid or expanded authority in membership consent before ordering",
    async (membershipConsent) => {
      expect(
        (await POST(request({ ...input, membershipConsent }))).status,
      ).toBe(400);
      expect(f.rpc).not.toHaveBeenCalled();
      expect(f.start).not.toHaveBeenCalled();
    },
  );
  it("does not open payment after stale or missing membership consent is rejected by the database", async () => {
    f.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const response = await POST(request(input));
    expect(response.status).toBe(409);
    expect(f.start).not.toHaveBeenCalled();
  });
  it("preserves the uncertain order retry boundary without asserting that membership was created", async () => {
    f.rpc.mockRejectedValue(new Error("private transport state"));
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private transport state");
    expect(f.start).not.toHaveBeenCalled();
  });
  it("rejects a membership quote detached from its selected package or minimum quantity", () => {
    const quote = {
      market: "PH",
      currency: "PHP",
      items: [
        {
          productId: qualification.productId,
          packageOfferId: qualification.packageOfferId,
          name: qualification.packageName,
          quantity: 1,
          unitMinor: 100,
          grossMinor: 100,
          discountMinor: 0,
          netMinor: 100,
        },
      ],
      subtotalMinor: 100,
      discountMinor: 0,
      totalMinor: 100,
      promotion: null,
      quoteHash: "a".repeat(64),
      membership: qualification,
    };
    expect(commerceQuoteSchema.safeParse(quote).success).toBe(true);
    expect(
      commerceQuoteSchema.safeParse({
        ...quote,
        membership: { ...qualification, minimumQuantity: 2 },
      }).success,
    ).toBe(false);
    expect(
      commerceQuoteSchema.safeParse({
        ...quote,
        membership: { ...qualification, packageOfferId: orderId },
      }).success,
    ).toBe(false);
    expect(
      commerceQuoteSchema.safeParse({
        ...quote,
        membership: { ...qualification, productId: orderId },
      }).success,
    ).toBe(false);
  });
  it("renders the exact plain-text documents and a separate required unchecked consent", () => {
    const html = renderToStaticMarkup(
      <MembershipConsentFields
        qualification={{
          ...qualification,
          termsText:
            "Sample text with <script>alert(1)</script> safely escaped.",
        }}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('name="membershipConsent"');
    expect(html).toContain("required");
    expect(html).not.toContain("checked=");
    expect(html).toContain(qualification.termsVersion);
    expect(html).toContain(qualification.codeVersion);
  });
  it("distinguishes an application acknowledgement from the confirmed-member welcome", () => {
    const pending = notificationContent({
      type: "membership_requested",
      reference: orderId,
    });
    const confirmed = notificationContent({
      type: "membership_confirmed",
      reference: orderId,
    });
    expect(pending.text).toContain("does not yet activate member pricing");
    expect(confirmed.text).toContain("verified RIWAY member record");
    expect(confirmed.html).toContain(
      "https://riway.example.invalid/account/membership",
    );
    expect(confirmed.html).not.toContain(orderId);
  });
});
