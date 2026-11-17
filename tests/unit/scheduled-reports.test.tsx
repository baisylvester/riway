import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));

import { saveReportSubscription } from "../../src/app/admin/report-actions";
import { ReportSubscriptionForm } from "../../src/components/report-subscription-form";
import { reportSubscriptionRequestSchema } from "../../src/lib/report-subscriptions";
import { notificationContent } from "../../src/services/resend-email";

const context = {
  market: "PH",
  currency: "PHP",
  frequency: "weekly",
  from: "2026-11-09",
  to: "2026-11-15",
  orders: 3,
  subtotalMinor: 150000,
  discountMinor: 10000,
  totalMinor: 140000,
  topProducts: [{ name: "<b>Sample</b>", units: 4, netMinor: 120000 }],
};

describe("sales report email", () => {
  beforeEach(() =>
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://riway.example.invalid"),
  );
  afterEach(() => vi.unstubAllEnvs());

  it("summarises the period, escapes names and links to the signed-in report", () => {
    const email = notificationContent({
      type: "sales_report",
      reference: "79100000-0000-4000-8000-000000000001",
      context,
    });
    expect(email.subject).toBe(
      "RIWAY weekly sales report · PH · 2026-11-09 to 2026-11-15",
    );
    expect(email.text).toContain("3 settled orders · total ₱1,400.00");
    expect(email.html).toContain("&lt;b&gt;Sample&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Sample</b>");
    expect(email.text).toContain(
      "https://riway.example.invalid/admin/reports?from=2026-11-09&to=2026-11-15",
    );
  });

  it("handles a period without sales and rejects malformed context", () => {
    const empty = notificationContent({
      type: "sales_report",
      reference: "79100000-0000-4000-8000-000000000001",
      context: { ...context, orders: 0, totalMinor: 0, topProducts: [] },
    });
    expect(empty.text).toContain("No product sales in this period.");
    expect(() =>
      notificationContent({
        type: "sales_report",
        reference: "79100000-0000-4000-8000-000000000001",
        context: { ...context, market: "US" },
      }),
    ).toThrow();
  });
});

describe("report subscription request", () => {
  it("maps off to null and refuses unknown values", () => {
    expect(
      reportSubscriptionRequestSchema.parse({ market: "SG", frequency: "off" }),
    ).toEqual({ market: "SG", frequency: null });
    expect(
      reportSubscriptionRequestSchema.safeParse({
        market: "SG",
        frequency: "daily",
      }).success,
    ).toBe(false);
  });
});

describe("saveReportSubscription action", () => {
  const form = (market: string, frequency: string) => {
    const data = new FormData();
    data.set("market", market);
    data.set("frequency", frequency);
    return data;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    f.access.mockResolvedValue({ user: { id: "u" }, allowed: true, mfa: true });
    f.session.mockResolvedValue({ client: { rpc: f.rpc } });
  });

  it("saves a schedule and confirms it from the response", async () => {
    f.rpc.mockResolvedValue({
      data: [{ market: "PH", frequency: "monthly" }],
      error: null,
    });
    const result = await saveReportSubscription(
      { message: "" },
      form("PH", "monthly"),
    );
    expect(result).toMatchObject({ ok: true });
    expect(f.rpc).toHaveBeenCalledWith("set_report_subscription", {
      p_market: "PH",
      p_frequency: "monthly",
    });
  });

  it("requires MFA and does not claim success on denial or mismatch", async () => {
    f.access.mockResolvedValueOnce({
      user: { id: "u" },
      allowed: true,
      mfa: false,
    });
    expect(
      (await saveReportSubscription({ message: "" }, form("PH", "weekly")))
        .message,
    ).toMatch(/authenticator/);
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(
      (await saveReportSubscription({ message: "" }, form("SG", "weekly"))).ok,
    ).toBeUndefined();
    f.rpc.mockResolvedValueOnce({
      data: [{ market: "PH", frequency: null }],
      error: null,
    });
    expect(
      (await saveReportSubscription({ message: "" }, form("PH", "weekly"))).ok,
    ).toBeUndefined();
  });
});

describe("ReportSubscriptionForm", () => {
  it("shows one schedule per market and warns while email is off", () => {
    const html = renderToStaticMarkup(
      <ReportSubscriptionForm
        subscriptions={[
          { market: "PH", frequency: "weekly" },
          { market: "SG", frequency: null },
        ]}
        emailEnabled={false}
      />,
    );
    expect(html).toContain("Scheduled email reports");
    expect(html).toContain("Email delivery is not switched on yet");
    expect(html.match(/name="market"/g)).toHaveLength(2);
    expect(html).toMatch(/value="weekly" selected/);
  });
});
