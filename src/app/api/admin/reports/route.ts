import { session, staffAccess } from "@/lib/data";
import { failure } from "@/lib/http";
import {
  csvCell,
  reportKinds,
  reportRange,
  reportRows,
  salesReportSchema,
  type ReportKind,
} from "@/lib/sales-report";

export async function GET(request: Request) {
  const access = await staffAccess();
  if (!access.allowed || !access.mfa)
    return failure("Staff access and MFA required.", 403);
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (!reportKinds.includes(kind as ReportKind))
    return failure("Choose a report breakdown.");
  const range = reportRange(params.get("from"), params.get("to"));
  if (range.adjusted) return failure("Choose a date range of up to 366 days.");
  const { client } = await session();
  const { data, error } = await client.rpc("staff_sales_report", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error)
    return error.code === "42501"
      ? failure("Market administrator or operations access is required.", 403)
      : failure("Sales report unavailable.", 503);
  const report = salesReportSchema.safeParse(data);
  if (!report.success) return failure("Sales report unavailable.", 503);
  const { columns, rows } = reportRows(report.data, kind as ReportKind);
  return new Response(
    [columns.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join(
      "\r\n",
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="riway-sales-${kind}-${range.from}-to-${range.to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
