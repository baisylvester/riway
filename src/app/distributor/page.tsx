import Link from "@/components/localized-link";
import { redirect } from "next/navigation";
import { session } from "@/lib/data";
import { money } from "@/lib/domain";
import { distributorDashboardSchema } from "@/lib/distributor-dashboard";
import { myListingSchema } from "@/lib/distributor-directory";
import { DistributorListingForms } from "@/components/distributor-listing-forms";
import QRCode from "qrcode";
import { siteOrigin } from "@/lib/seo";
export const metadata = { title: "Distributor dashboard" };
export default async function Distributor() {
  const { client, user } = await session();
  if (!user) redirect("/auth/login");
  const { data: d } = await client
    .from("distributor_profiles")
    .select("code,display_name,active,verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const verified = !!(d?.active && d.verified_at);
  const url = d ? `${siteOrigin()}/d/${encodeURIComponent(d.code)}` : "";
  const qr = verified
    ? await QRCode.toDataURL(url, { width: 220, margin: 2 })
    : "";
  // The database re-verifies the distributor and returns only their own
  // attributed, settled orders with pseudonymous customer labels.
  const dashboard = verified
    ? distributorDashboardSchema.safeParse(
        (await client.rpc("my_distributor_dashboard")).data,
      )
    : null;
  const listing = verified
    ? myListingSchema.safeParse(
        (await client.rpc("my_distributor_listing")).data,
      )
    : null;
  return (
    <section className="section page-section">
      <span className="eyebrow">RIWAY DISTRIBUTOR AREA</span>
      <h1>
        Your connections.
        <br />
        Your community.
      </h1>
      {verified && d ? (
        <>
          <div className="panel">
            <h2>{d.display_name}</h2>
            <p>
              <Link href="/account/consultations">
                Manage consultation availability and bookings
              </Link>
            </p>
            <p>
              <Link href="/distributor/library">
                Search the campaign content library
              </Link>
            </p>
            <p>Verified distributor code: {d.code}</p>
            <p>
              <Link className="return-link" href={`/d/${d.code}`}>
                {url}
              </Link>
            </p>
            <img
              width={220}
              height={220}
              src={qr}
              alt="Your verified distributor introduction QR code"
            />
          </div>
          {listing?.success && (
            <DistributorListingForms listing={listing.data} />
          )}
          {dashboard?.success ? (
            <>
              <div className="panel stack">
                <h2>Orders from your introductions</h2>
                <p className="muted">
                  Paid orders from the last 12 months where you are the recorded
                  sponsor. Customers are shown by a private label, not by name
                  or contact details. Volume, ranks and commissions are
                  calculated by RIWAY, not on this site.
                </p>
                {dashboard.data.orders.length === 0 ? (
                  <p className="muted">No paid orders yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Units</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.data.orders.map((o) => (
                        <tr key={o.reference + o.placedAt}>
                          <td>{o.reference}</td>
                          <td>{o.placedAt.slice(0, 10)}</td>
                          <td>{o.customer}</td>
                          <td>{o.units}</td>
                          <td>{money(o.totalMinor, o.currency)}</td>
                          <td>{o.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="panel stack">
                <h2>Customers and expected reorders</h2>
                <p className="muted">
                  Expected reorder dates use RIWAY-approved product cycles and
                  appear only for products that have one.
                </p>
                {dashboard.data.customers.length === 0 ? (
                  <p className="muted">No customers yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>First order</th>
                        <th>Last order</th>
                        <th>Paid orders</th>
                        <th>Expected reorder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.data.customers.map((c) => (
                        <tr key={c.customer}>
                          <td>{c.customer}</td>
                          <td>{c.firstOrderAt.slice(0, 10)}</td>
                          <td>{c.lastOrderAt.slice(0, 10)}</td>
                          <td>{c.paidOrders}</td>
                          <td>{c.expectedReorderOn ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="panel stack">
                <h2>Approved marketing materials</h2>
                {dashboard.data.materials.length === 0 ? (
                  <p className="muted">No materials have been published yet.</p>
                ) : (
                  <ul>
                    {dashboard.data.materials.map((m) => (
                      <li key={m.url + m.title}>
                        <a href={m.url} rel="noopener noreferrer">
                          {m.title}
                        </a>
                        {m.description && <> — {m.description}</>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="notice">
              Your order summary is unavailable right now. Please try again
              later.
            </div>
          )}
        </>
      ) : (
        <div className="panel">
          <h2>Distributor verification required.</h2>
          <p className="muted">
            This account is not linked to an active, verified RIWAY distributor.
            Roles and sponsor relationships cannot be self-assigned.
          </p>
          <Link className="button" href="/support">
            Contact RIWAY support
          </Link>
        </div>
      )}
    </section>
  );
}
