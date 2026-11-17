import { z } from "zod";

// Mirrors private.staff_sales_report. Dates are inclusive UTC calendar days.
export const reportKinds = ["market", "product", "package", "distributor"] as const;
export type ReportKind = (typeof reportKinds)[number];

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const day = (date: Date) => date.toISOString().slice(0, 10);

function parseDay(value: unknown) {
  if (typeof value !== "string" || !isoDay.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || day(date) !== value ? null : value;
}

/** Valid inclusive range of at most 367 days; otherwise the last 30 days. */
export function reportRange(from: unknown, to: unknown, now = new Date()) {
  const end = parseDay(to) ?? day(now);
  const fallbackStart = day(new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 864e5));
  const start = parseDay(from) ?? fallbackStart;
  const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 864e5;
  if (span < 0 || span > 366)
    return { from: fallbackStart, to: end, adjusted: true };
  return { from: start, to: end, adjusted: false };
}

const market = z.enum(["PH", "SG", "MY"]);
const currency = z.string().regex(/^[A-Z]{3}$/);
const count = z.number().int().nonnegative();
const amount = z.number().int();

export const salesReportSchema = z.object({
  from: z.string().regex(isoDay),
  to: z.string().regex(isoDay),
  markets: z.array(market).min(1).max(3),
  byMarket: z.array(
    z.object({
      market,
      currency,
      orders: count,
      subtotalMinor: amount,
      discountMinor: amount,
      totalMinor: amount,
    }),
  ),
  byProduct: z.array(
    z.object({
      market,
      currency,
      productId: z.uuid(),
      name: z.string().max(200),
      units: count,
      netMinor: amount,
    }),
  ),
  byPackage: z.array(
    z.object({
      market,
      currency,
      packageOfferId: z.uuid(),
      name: z.string().max(200),
      units: count,
      netMinor: amount,
    }),
  ),
  byDistributor: z.array(
    z.object({
      market,
      currency,
      distributorId: z.uuid().nullable(),
      code: z.string().max(80).nullable(),
      name: z.string().max(200).nullable(),
      orders: count,
      totalMinor: amount,
    }),
  ),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

/** CSV rows for one breakdown. Amounts stay in minor units with their currency. */
export function reportRows(report: SalesReport, kind: ReportKind) {
  if (kind === "market")
    return {
      columns: ["market", "currency", "orders", "subtotal_minor", "discount_minor", "total_minor"],
      rows: report.byMarket.map((r) => [r.market, r.currency, r.orders, r.subtotalMinor, r.discountMinor, r.totalMinor]),
    };
  if (kind === "product")
    return {
      columns: ["market", "currency", "product_id", "product", "units", "net_minor"],
      rows: report.byProduct.map((r) => [r.market, r.currency, r.productId, r.name, r.units, r.netMinor]),
    };
  if (kind === "package")
    return {
      columns: ["market", "currency", "package_offer_id", "package", "units", "net_minor"],
      rows: report.byPackage.map((r) => [r.market, r.currency, r.packageOfferId, r.name, r.units, r.netMinor]),
    };
  return {
    columns: ["market", "currency", "distributor_id", "distributor_code", "distributor", "orders", "total_minor"],
    rows: report.byDistributor.map((r) => [r.market, r.currency, r.distributorId, r.code, r.name, r.orders, r.totalMinor]),
  };
}

/** Quote a CSV cell and neutralise spreadsheet formula prefixes. */
export function csvCell(value: unknown) {
  return `"${String(value ?? "")
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""')}"`;
}
