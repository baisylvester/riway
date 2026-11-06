import Link from "next/link";
import { session } from "@/lib/data";
import { money } from "@/lib/domain";
import { stripeReadiness } from "@/lib/stripe-config";
export default async function Payments() {
  const readiness = stripeReadiness();
  const { client } = await session();
  const result = await client.rpc("staff_stripe_payments");
  if (result.error) throw new Error("Payment records are unavailable.");
  const rows = result.data as Array<{
    order_id: string;
    market: string;
    phase: string;
    livemode: boolean;
    amount_minor: number;
    currency: string;
    attention: string | null;
    updated_at: string;
  }>;
  return (
    <>
      <h1>Payments</h1>
      <p className="notice">{readiness.message}</p>
      <p>
        Payment confirmation comes from verified Stripe events. Review flagged
        orders in Stripe before fulfillment or releasing reserved stock.
      </p>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Market</th>
                <th>Mode</th>
                <th>Total</th>
                <th>Stripe status</th>
                <th>Attention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.order_id}>
                  <td>{r.order_id.slice(0, 8).toUpperCase()}</td>
                  <td>{r.market}</td>
                  <td>{r.livemode ? "Live" : "Test"}</td>
                  <td>{money(r.amount_minor, r.currency.toUpperCase())}</td>
                  <td>{r.phase}</td>
                  <td>{r.attention ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          No Stripe checkouts in your authorized markets.
        </div>
      )}
      <Link href="/admin/orders" className="text-link">
        View orders →
      </Link>
    </>
  );
}
