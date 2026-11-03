import Link from "next/link";
import { session } from "@/lib/data";
export default async function Admin() {
  const { client } = await session();
  const [orders, products, content, stock] = await Promise.all([
    client.from("orders").select("id", { head: true, count: "exact" }),
    client.from("products").select("id", { head: true, count: "exact" }),
    client
      .from("content_entries")
      .select("id", { head: true, count: "exact" })
      .eq("status", "review"),
    client.from("inventory").select("on_hand,reserved,low_stock_threshold"),
  ]);
  return (
    <>
      <h1>At a glance.</h1>
      <p className="muted">Your authorized markets and operations.</p>
      <div className="stats">
        <div className="stat">
          <span>Orders</span>
          <strong>{orders.count ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Products</span>
          <strong>{products.count ?? 0}</strong>
        </div>
        <div className="stat">
          <span>Awaiting review</span>
          <strong>{content.count ?? 0}</strong>
        </div>
      </div>
      <div className="notice">
        Online sales are closed. Payments, membership synchronization, shipping
        and notifications require approved providers.
      </div>
      <div className="panel">
        <h2>Inventory attention</h2>
        <p>
          {stock.data?.filter(
            (i) => i.on_hand - i.reserved <= i.low_stock_threshold,
          ).length ?? 0}{" "}
          product-market stock records are at or below their low-stock
          threshold.
        </p>
        <Link className="text-link" href="/admin/inventory">
          Manage inventory →
        </Link>
      </div>
    </>
  );
}
