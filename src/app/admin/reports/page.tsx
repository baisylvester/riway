import { session } from "@/lib/data";
import { money } from "@/lib/domain";
import {
  reportRange,
  salesChannelLabels,
  salesReportSchema,
  type ReportKind,
} from "@/lib/sales-report";
import { reportSubscriptionsSchema } from "@/lib/report-subscriptions";
import { ReportSubscriptionForm } from "@/components/report-subscription-form";

export const metadata = { title: "Sales reports" };

function CsvLink({
  kind,
  from,
  to,
}: {
  kind: ReportKind;
  from: string;
  to: string;
}) {
  const query = new URLSearchParams({ kind, from, to });
  return (
    <a className="button button-outline" href={`/api/admin/reports?${query}`}>
      Export CSV
    </a>
  );
}

function Empty() {
  return <p className="muted">No settled sales in this period.</p>;
}

export default async function SalesReports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const range = reportRange(params.from, params.to);
  const { client } = await session();
  const { data, error } = await client.rpc("staff_sales_report", {
    p_from: range.from,
    p_to: range.to,
  });
  const report = salesReportSchema.safeParse(data);
  // Optional section: hidden if scheduling is unavailable or access is denied.
  const subscriptions = reportSubscriptionsSchema.safeParse(
    (await client.rpc("my_report_subscriptions")).data,
  );
  return (
    <>
      <h1>Sales reports</h1>
      <p className="muted">
        Settled orders only: paid, and not cancelled, refunded or under payment
        review. Dates are order-placement days in UTC. Amounts stay in each
        market&apos;s currency.
      </p>
      <form className="admin-actions" method="get">
        <label>
          From
          <input type="date" name="from" defaultValue={range.from} required />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={range.to} required />
        </label>
        <button className="button">Update report</button>
      </form>
      {subscriptions.success && (
        <ReportSubscriptionForm
          subscriptions={subscriptions.data}
          emailEnabled={process.env.EMAIL_PROVIDER === "resend"}
        />
      )}
      {range.adjusted && (
        <p className="notice">
          Reports cover up to 366 days, so the last 30 days are shown instead.
        </p>
      )}
      {error || !report.success ? (
        <p className="notice">
          {error?.code === "42501"
            ? "Market administrator or operations access with verified MFA is required for sales reports."
            : "Sales reports are unavailable. Reporting setup may be pending."}
        </p>
      ) : (
        <>
          <p>
            Markets in this report: {report.data.markets.join(", ")}. Period{" "}
            {report.data.from} to {report.data.to}.
          </p>
          <section className="stack">
            <div className="admin-actions">
              <h2>By market</h2>
              <CsvLink kind="market" from={range.from} to={range.to} />
            </div>
            {report.data.byMarket.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Orders</th>
                      <th>Subtotal</th>
                      <th>Discounts</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byMarket.map((r) => (
                      <tr key={r.market}>
                        <td>{r.market}</td>
                        <td>{r.orders}</td>
                        <td>{money(r.subtotalMinor, r.currency)}</td>
                        <td>{money(r.discountMinor, r.currency)}</td>
                        <td>{money(r.totalMinor, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </section>
          <section className="stack">
            <div className="admin-actions">
              <h2>By channel</h2>
              <CsvLink kind="channel" from={range.from} to={range.to} />
            </div>
            <p className="muted">
              Online orders on this platform, all introduced by a distributor. A
              repeat purchase follows an earlier settled order by the same
              customer. Offline and service-centre sales are recorded in
              RIWAY&apos;s own systems and are not included.
            </p>
            {report.data.byChannel.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Channel</th>
                      <th>Orders</th>
                      <th>With voucher</th>
                      <th>Discounts</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byChannel.map((r) => (
                      <tr key={`${r.market}:${r.channel}`}>
                        <td>{r.market}</td>
                        <td>{salesChannelLabels[r.channel]}</td>
                        <td>{r.orders}</td>
                        <td>{r.voucherOrders}</td>
                        <td>{money(r.discountMinor, r.currency)}</td>
                        <td>{money(r.totalMinor, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </section>
          <section className="stack">
            <div className="admin-actions">
              <h2>By product</h2>
              <CsvLink kind="product" from={range.from} to={range.to} />
            </div>
            {report.data.byProduct.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Product</th>
                      <th>Units</th>
                      <th>Net sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byProduct.map((r) => (
                      <tr key={`${r.market}:${r.productId}`}>
                        <td>{r.market}</td>
                        <td>{r.name}</td>
                        <td>{r.units}</td>
                        <td>{money(r.netMinor, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </section>
          <section className="stack">
            <div className="admin-actions">
              <h2>By package</h2>
              <CsvLink kind="package" from={range.from} to={range.to} />
            </div>
            {report.data.byPackage.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Package</th>
                      <th>Units</th>
                      <th>Net sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byPackage.map((r) => (
                      <tr key={`${r.market}:${r.packageOfferId}`}>
                        <td>{r.market}</td>
                        <td>{r.name}</td>
                        <td>{r.units}</td>
                        <td>{money(r.netMinor, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </section>
          <section className="stack">
            <div className="admin-actions">
              <h2>By distributor</h2>
              <CsvLink kind="distributor" from={range.from} to={range.to} />
            </div>
            {report.data.byDistributor.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Distributor</th>
                      <th>Code</th>
                      <th>Orders</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.byDistributor.map((r) => (
                      <tr key={`${r.market}:${r.distributorId ?? "none"}`}>
                        <td>{r.market}</td>
                        <td>{r.name ?? "No recorded distributor"}</td>
                        <td>{r.code ?? ""}</td>
                        <td>{r.orders}</td>
                        <td>{money(r.totalMinor, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </section>
        </>
      )}
    </>
  );
}
