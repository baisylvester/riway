import Link from "next/link";
import { resolveSupport } from "../actions";
import { notFound } from "next/navigation";
import { session } from "@/lib/data";
import {
  ProductForm,
  ContentForm,
  StockForm,
  OfferForm,
  RecommendationForm,
} from "@/components/admin-forms";
import { money, type Product } from "@/lib/domain";
import { pageNumber } from "@/lib/pagination";
import { orderStatusLabels } from "@/lib/fulfilment";
import { OrderFulfilmentAdmin } from "@/components/order-fulfilment-admin";
import { z } from "zod";
import { scheduleLabels, scheduleState } from "@/lib/content-schedule";
export default async function AdminSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ edit?: string; page?: string; order?: string }>;
}) {
  const { section } = await params;
  const { edit, page: rawPage, order } = await searchParams;
  const page = pageNumber(rawPage);
  if (section === "orders" && order !== undefined) {
    if (!z.uuid().safeParse(order).success) notFound();
    return <OrderFulfilmentAdmin orderId={order} />;
  }
  const { client } = await session();
  const { data: products } = await client
    .from("products")
    .select("*")
    .order("name");
  const ps = (products ?? []) as Product[];
  const editing = edit ? ps.find((p) => p.id === edit) : undefined;
  const recommended =
    section === "products" && editing
      ? (
          (
            await client
              .from("product_recommendations")
              .select("recommended_id,position")
              .eq("product_id", editing.id)
              .order("position")
          ).data ?? []
        ).map((r: { recommended_id: string }) => r.recommended_id)
      : [];
  if (section === "products")
    return (
      <>
        <div className="admin-actions">
          <h1>Products</h1>
          <Link className="button" href="?edit=new">
            New product
          </Link>
        </div>
        {edit ? (
          <>
            <ProductForm product={editing} />
            {editing && (
              <RecommendationForm
                product={editing}
                products={ps}
                current={recommended}
              />
            )}
          </>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Collection</th>
                  <th>Status</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.category}</td>
                    <td>
                      <span className="status">{p.status}</span>
                    </td>
                    <td>
                      <Link className="return-link" href={`?edit=${p.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  if (section === "inventory") {
    const { data: rows, error } = await client
      .from("inventory")
      .select("*,products(name)")
      .order("market");
    if (error) throw Error("Inventory unavailable");
    return (
      <>
        <h1>Inventory</h1>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product / market</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id + r.market}>
                  <td>
                    {r.products?.name} / {r.market}
                  </td>
                  <td>{r.on_hand}</td>
                  <td>{r.reserved}</td>
                  <td>{r.on_hand - r.reserved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 30 }}>
          <StockForm products={ps} />
        </div>
      </>
    );
  }
  if (section === "pricing") {
    const { data: rows } = await client
      .from("product_offers")
      .select("*,products(name)")
      .order("market");
    return (
      <>
        <h1>Market pricing</h1>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product / market</th>
                <th>Retail</th>
                <th>Member</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.product_id + r.market}>
                  <td>
                    {r.products?.name} / {r.market}
                  </td>
                  <td>{money(r.retail_minor, r.currency)}</td>
                  <td>{money(r.member_minor, r.currency)}</td>
                  <td>{r.regulatory_approved ? "Verified" : "Pending"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 30 }}>
          <OfferForm products={ps} />
        </div>
      </>
    );
  }
  if (section === "content") {
    const { data: rows } = await client
      .from("content_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1);
    const entry = rows?.find((r) => r.id === edit);
    const { data: media } = edit
      ? await client
          .from("media_assets")
          .select("public_url,file_name,market")
          .not("public_url", "is", null)
          .order("published_at", { ascending: false })
          .limit(100)
      : { data: [] };
    const images = (media ?? []).map((m) => ({
      url: m.public_url as string,
      name: m.file_name as string,
      market: m.market as string,
    }));
    return (
      <>
        <div className="admin-actions">
          <h1>Content studio</h1>
          <Link className="button" href="?edit=new">
            New content
          </Link>
        </div>
        {edit ? (
          <ContentForm entry={entry} images={images} />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Market</th>
                    <th>Status</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((r) => (
                    <tr key={r.id}>
                      <td>{r.title}</td>
                      <td>{r.kind}</td>
                      <td>{r.market ?? "Global"}</td>
                      <td>
                        <span className="status">
                          {scheduleLabels[scheduleState(r)]}
                        </span>
                        {r.publish_at && (
                          <div className="small muted">
                            From{" "}
                            {new Date(r.publish_at)
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")}{" "}
                            UTC
                          </div>
                        )}
                        {r.unpublish_at && (
                          <div className="small muted">
                            Until{" "}
                            {new Date(r.unpublish_at)
                              .toISOString()
                              .slice(0, 16)
                              .replace("T", " ")}{" "}
                            UTC
                          </div>
                        )}
                      </td>
                      <td>
                        <Link className="return-link" href={`?edit=${r.id}`}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows?.length && (
              <div className="empty">
                <p>
                  No content entries yet. Create a draft to begin the approval
                  workflow.
                </p>
              </div>
            )}
            <Pagination page={page} hasNext={rows?.length === 30} />
          </>
        )}
      </>
    );
  }
  if (section === "orders") {
    const { data: rows, error } = await client
      .from("orders")
      .select("id,market,total_minor,currency,status,payment_status,created_at")
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1);
    if (error) throw Error("Orders unavailable");
    return (
      <>
        <div className="admin-actions">
          <h1>Orders</h1>
          <a className="button button-outline" href="/api/admin/export">
            Export latest 1,000 orders
          </a>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Market</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/orders?order=${r.id}`}>
                      {r.id.slice(0, 8).toUpperCase()}
                    </Link>
                  </td>
                  <td>{r.market}</td>
                  <td>{money(r.total_minor, r.currency)}</td>
                  <td>{r.payment_status}</td>
                  <td>{orderStatusLabels[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            <p>No orders. Online sales remain closed.</p>
          </div>
        )}
        <Pagination page={page} hasNext={rows.length === 30} />
      </>
    );
  }
  if (section === "support") {
    const { data: rows } = await client
      .from("support_tickets")
      .select("id,subject,message,status,market,created_at")
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1);
    return (
      <>
        <h1>Support requests</h1>
        <div className="stack">
          {rows?.map((r) => (
            <div className="panel" key={r.id}>
              <h3>
                {r.subject} · {r.market}
              </h3>
              <span className="status">{r.status}</span>
              <p className="content-body">{r.message}</p>
              {r.status !== "resolved" && (
                <form action={resolveSupport.bind(null, r.id)}>
                  <button className="button button-outline">
                    Mark resolved
                  </button>
                </form>
              )}
            </div>
          ))}
          {!rows?.length && (
            <p>No support requests in your authorized markets.</p>
          )}
        </div>
        <Pagination page={page} hasNext={rows?.length === 30} />
      </>
    );
  }
  if (section === "audit") {
    const { data: rows } = await client
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .range((page - 1) * 30, page * 30 - 1);
    return (
      <>
        <h1>Audit trail</h1>
        <p className="muted small">
          Administrator access required. Logs contain action metadata, excluding
          customer details.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at.slice(0, 19)}</td>
                  <td>{r.action}</td>
                  <td>{r.entity}</td>
                  <td>{r.actor_id?.slice(0, 8) ?? "Migration"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} hasNext={rows?.length === 30} />
      </>
    );
  }
  if (section === "integrations") {
    const { data: rows } = await client.from("markets").select("*");
    return (
      <>
        <h1>Launch readiness</h1>
        <div className="notice">
          This application is under development. It is not approved for
          commercial launch.
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Online policy</th>
                <th>Payment integration</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={r.code}>
                  <td>{r.name}</td>
                  <td>{r.online_sales_approved ? "Approved" : "Pending"}</td>
                  <td>{r.payments_ready ? "Configured" : "Not connected"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="stack" style={{ marginTop: 25 }}>
          {[
            "RIWAY member and compensation API",
            "Payment merchant account and webhook contract",
            "Courier rates, labels and tracking",
            "Transactional email and SMS",
            "Legal terms and market-specific product approvals",
            "Monitoring, backup restore and penetration test",
            "GitHub repository and Vercel deployment",
          ].map((t) => (
            <div className="panel" key={t}>
              <h3>{t}</h3>
              <span className="status">Awaiting external dependency</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  notFound();
}
function Pagination({ page, hasNext }: { page: number; hasNext: boolean }) {
  return (
    <nav className="tab-links" aria-label="Pagination">
      {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
      <span className="small">Page {page}</span>
      {hasNext && <Link href={`?page=${page + 1}`}>Next</Link>}
    </nav>
  );
}
