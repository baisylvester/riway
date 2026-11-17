import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ access: vi.fn(), session: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));

import { GET } from "../../src/app/api/admin/reports/route";
import SalesReports from "../../src/app/admin/reports/page";
import {
  csvCell,
  reportRange,
  reportRows,
  salesReportSchema,
} from "../../src/lib/sales-report";

const productId = "78000000-0000-4000-8000-000000000001";
const offerId = "78000000-0000-4000-8000-000000000002";
const distributorId = "78000000-0000-4000-8000-000000000003";
const report = () => ({
  from: "2026-11-01",
  to: "2026-11-17",
  markets: ["PH"],
  byMarket: [
    { market: "PH", currency: "PHP", orders: 2, subtotalMinor: 75000, discountMinor: 5000, totalMinor: 70000 },
  ],
  byChannel: [
    { market: "PH", currency: "PHP", channel: "first_purchase", orders: 1, voucherOrders: 1, discountMinor: 5000, totalMinor: 20000 },
    { market: "PH", currency: "PHP", channel: "repeat_purchase", orders: 1, voucherOrders: 0, discountMinor: 0, totalMinor: 50000 },
  ],
  byProduct: [
    { market: "PH", currency: "PHP", productId, name: "=HYPERLINK(\"x\")", units: 3, netMinor: 70000 },
  ],
  byPackage: [
    { market: "PH", currency: "PHP", packageOfferId: offerId, name: "Fixture package", units: 1, netMinor: 50000 },
  ],
  byDistributor: [
    { market: "PH", currency: "PHP", distributorId, code: "QA-1", name: "<b>Fixture</b>", orders: 2, totalMinor: 70000 },
  ],
});
const request = (query: string) =>
  new Request(`https://riway.example.invalid/api/admin/reports?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  f.access.mockResolvedValue({ user: { id: "u" }, allowed: true, mfa: true });
  f.session.mockResolvedValue({ client: { rpc: f.rpc }, user: { id: "u" } });
  f.rpc.mockResolvedValue({ data: report(), error: null });
});

describe("report date range", () => {
  const now = new Date("2026-11-17T08:00:00Z");
  it("defaults to the last 30 UTC days", () => {
    expect(reportRange(undefined, undefined, now)).toEqual({
      from: "2026-10-19",
      to: "2026-11-17",
      adjusted: false,
    });
  });
  it("accepts a valid inclusive range of up to 366 days", () => {
    expect(reportRange("2025-11-16", "2026-11-17", now).adjusted).toBe(false);
    expect(reportRange("2025-11-15", "2026-11-17", now).adjusted).toBe(true);
  });
  it("falls back for reversed, malformed or impossible dates", () => {
    expect(reportRange("2026-11-18", "2026-11-17", now).adjusted).toBe(true);
    expect(reportRange("2026-02-30", "2026-03-01", now).from).toBe("2026-01-31");
    expect(reportRange("17/11/2026", "2026-11-17", now).from).toBe("2026-10-19");
  });
});

describe("report CSV", () => {
  it("neutralises spreadsheet formulas and quotes every cell", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-5")).toBe('"\'-5"');
    expect(csvCell(null)).toBe('""');
  });
  it("keeps amounts in minor units with their currency", () => {
    const { columns, rows } = reportRows(salesReportSchema.parse(report()), "market");
    expect(columns).toContain("total_minor");
    expect(rows[0]).toEqual(["PH", "PHP", 2, 75000, 5000, 70000]);
  });
  it("exports channel rows and rejects unknown channels", () => {
    const { columns, rows } = reportRows(salesReportSchema.parse(report()), "channel");
    expect(columns).toEqual(["market", "currency", "channel", "orders", "voucher_orders", "discount_minor", "total_minor"]);
    expect(rows[0]).toEqual(["PH", "PHP", "first_purchase", 1, 1, 5000, 20000]);
    const bad = report();
    bad.byChannel[0].channel = "offline";
    expect(salesReportSchema.safeParse(bad).success).toBe(false);
  });
  it("treats a report without channels as empty", () => {
    const { byChannel: _omit, ...older } = report();
    expect(salesReportSchema.parse(older).byChannel).toEqual([]);
  });
  it("requires staff MFA, a breakdown and a bounded range", async () => {
    f.access.mockResolvedValueOnce({ user: { id: "u" }, allowed: true, mfa: false });
    expect((await GET(request("kind=market"))).status).toBe(403);
    expect((await GET(request("kind=everything"))).status).toBe(400);
    expect(
      (await GET(request("kind=market&from=2024-01-01&to=2026-11-17"))).status,
    ).toBe(400);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("exports a safe private CSV for the requested breakdown", async () => {
    const response = await GET(request("kind=product&from=2026-11-01&to=2026-11-17"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(
      "riway-sales-product-2026-11-01-to-2026-11-17.csv",
    );
    expect(await response.text()).toContain('"\'=HYPERLINK(""x"")"');
    expect(f.rpc).toHaveBeenCalledWith("staff_sales_report", {
      p_from: "2026-11-01",
      p_to: "2026-11-17",
    });
  });
  it("maps database denial and malformed responses without leaking details", async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect((await GET(request("kind=market"))).status).toBe(403);
    f.rpc.mockResolvedValueOnce({ data: { private: "fixture" }, error: null });
    const bad = await GET(request("kind=market"));
    expect(bad.status).toBe(503);
    expect(await bad.text()).not.toContain("fixture");
  });
});

describe("reports page", () => {
  it("renders every breakdown with escaped names and per-currency amounts", async () => {
    const html = renderToStaticMarkup(
      await SalesReports({
        searchParams: Promise.resolve({ from: "2026-11-01", to: "2026-11-17" }),
      }),
    );
    for (const heading of ["By market", "By channel", "By product", "By package", "By distributor"])
      expect(html).toContain(heading);
    expect(html).toContain("First purchase");
    expect(html).toContain("Repeat purchase");
    expect(html).toContain("kind=channel");
    expect(html).toContain("&lt;b&gt;Fixture&lt;/b&gt;");
    expect(html).toContain("₱700.00");
    expect(html).toContain("₱50.00");
    expect(html).toContain("kind=distributor");
  });
  it("shows access and setup problems instead of empty tables", async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(
      renderToStaticMarkup(await SalesReports({ searchParams: Promise.resolve({}) })),
    ).toContain("verified MFA is required");
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect(
      renderToStaticMarkup(await SalesReports({ searchParams: Promise.resolve({}) })),
    ).toContain("setup may be pending");
  });
});
