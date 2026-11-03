import { session, staffAccess } from "@/lib/data";
import { failure } from "@/lib/http";
export async function GET() {
  const access = await staffAccess();
  if (!access.allowed || !access.mfa)
    return failure("Staff access and MFA required.", 403);
  const { client } = await session();
  const { data, error } = await client
    .from("orders")
    .select("id,market,currency,total_minor,status,payment_status,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return failure("Export unavailable.", 503);
  const escape = (s: unknown) =>
    `"${String(s ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const columns = [
    "id",
    "market",
    "currency",
    "total_minor",
    "status",
    "payment_status",
    "created_at",
  ] as const;
  return new Response(
    [
      columns.join(","),
      ...data.map((r) => columns.map((c) => escape(r[c])).join(",")),
    ].join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="riway-orders-latest-1000.csv"',
        "Cache-Control": "private, no-store",
      },
    },
  );
}
