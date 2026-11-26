import Link from "@/components/localized-link";
import { session } from "@/lib/data";
import { money, markets, type Market } from "@/lib/domain";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
import {
  XenditRoutingForm,
  type XenditRouting,
} from "@/components/xendit-routing-form";
export default async function Payments() {
  const readiness = stripeReadiness();
  const xendit = xenditReadiness();
  const { client } = await session();
  const [result, xenditResult, routingResult] = await Promise.all([
    client.rpc("staff_stripe_payments"),
    client.rpc("staff_xendit_payments"),
    client.rpc("staff_xendit_market_accounts"),
  ]);
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
  const xenditRows = (xenditResult.data ?? []) as Array<{
    order_id: string;
    attempt_no: number;
    market: string;
    channel_code: string;
    phase: string;
    livemode: boolean;
    amount_minor: number;
    currency: string;
    routing: string;
    attention: string | null;
  }>;
  const routing = (routingResult.data ?? []) as XenditRouting[];
  return (
    <>
      <h1>Payments</h1>
      <p className="notice">
        {readiness.message} {xendit.message}
      </p>
      <p>
        Payment confirmation comes from verified Stripe and Xendit events,
        re-read from the provider. Review flagged orders in the provider
        dashboard before fulfillment or releasing reserved stock. Merchant
        settlement and payouts are managed in each provider dashboard and are
        separate from customer payment confirmation.
      </p>
      <h2>Stripe</h2>
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
      <h2>Xendit</h2>
      {xenditRows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Attempt</th>
                <th>Market</th>
                <th>Mode</th>
                <th>Channel</th>
                <th>Account</th>
                <th>Total</th>
                <th>Status</th>
                <th>Attention</th>
              </tr>
            </thead>
            <tbody>
              {xenditRows.map((r) => (
                <tr key={`${r.order_id}-${r.attempt_no}`}>
                  <td>{r.order_id.slice(0, 8).toUpperCase()}</td>
                  <td>{r.attempt_no}</td>
                  <td>{r.market}</td>
                  <td>{r.livemode ? "Live" : "Test"}</td>
                  <td>{r.channel_code}</td>
                  <td>{r.routing}</td>
                  <td>{money(r.amount_minor, r.currency)}</td>
                  <td>{r.phase}</td>
                  <td>{r.attention ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          No Xendit payments in your authorized markets.
        </div>
      )}
      <h2>Xendit account routing</h2>
      <p className="small muted">
        Each market is processed by the RIWAY master account or one xenPlatform
        sub-account. Tick only channels that are activated for that account in
        Xendit Dashboard → Settings → Payment methods. Saving requires the
        market admin role and is audit-logged.
      </p>
      {(Object.keys(markets) as Market[]).flatMap((m) =>
        [false, true].map((live) => {
          const current = routing.find(
            (r) => r.market === m && r.livemode === live,
          );
          return (
            <XenditRoutingForm
              key={`${m}-${live}`}
              market={m}
              livemode={live}
              current={current}
            />
          );
        }),
      )}
      <Link href="/admin/orders" className="text-link">
        View orders →
      </Link>
    </>
  );
}
