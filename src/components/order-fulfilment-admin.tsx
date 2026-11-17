import Link from "next/link";
import { notFound } from "next/navigation";
import { session } from "@/lib/data";
import { money } from "@/lib/domain";
import { orderFulfilmentSchema, orderStatusLabels } from "@/lib/fulfilment";
import { FulfilmentTimeline } from "./fulfilment-timeline";
import { FulfilmentForm } from "./fulfilment-form";

type Address = Partial<
  Record<"full_name" | "phone" | "line1" | "city" | "postal_code" | "country", string>
>;
type Line = { product_name: string; quantity: number; net_minor: number | null };

// Staff order view. Row-level security limits the order to market
// administrators and operations staff; the fulfilment RPC rechecks that scope.
export async function OrderFulfilmentAdmin({ orderId }: { orderId: string }) {
  const { client } = await session();
  const { data: order, error } = await client
    .from("orders")
    .select(
      "id,market,currency,total_minor,status,payment_status,created_at,address,order_items(product_name,quantity,net_minor)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw Error("Order unavailable");
  if (!order) notFound();
  const result = await client.rpc("order_fulfilment", { p_order: orderId });
  const fulfilment = orderFulfilmentSchema.safeParse(result.data);
  const address = (order.address ?? {}) as Address;
  return (
    <>
      <div className="admin-actions">
        <h1>Order {order.id.slice(0, 8).toUpperCase()}</h1>
        <Link className="return-link" href="/admin/orders">
          ← All orders
        </Link>
      </div>
      <div className="two-column">
        <div className="panel stack">
          <p>
            <span className="status">
              {orderStatusLabels[order.status] ?? order.status}
            </span>{" "}
            Payment: {order.payment_status} · Market {order.market}
          </p>
          {(order.order_items as Line[]).map((line, index) => (
            <div key={index} className="order-row">
              <span>
                {line.product_name} × {line.quantity}
              </span>
              <span>
                {line.net_minor === null
                  ? ""
                  : money(line.net_minor, order.currency)}
              </span>
            </div>
          ))}
          <p className="price">Total {money(order.total_minor, order.currency)}</p>
          <h3>Deliver to</h3>
          <address style={{ fontStyle: "normal", overflowWrap: "anywhere" }}>
            {address.full_name}
            <br />
            {address.line1}
            <br />
            {address.city} {address.postal_code} · {address.country}
            <br />
            {address.phone}
          </address>
        </div>
        <div className="stack">
          {fulfilment.success ? (
            <>
              <FulfilmentTimeline fulfilment={fulfilment.data} />
              {/* Keyed by status so the next step starts with a fresh form. */}
              <FulfilmentForm
                key={fulfilment.data.status}
                fulfilment={fulfilment.data}
              />
            </>
          ) : (
            <p className="notice">
              {result.error?.code === "42501"
                ? "Market administrator or operations access with verified MFA is required to fulfil this order."
                : "Order fulfilment is unavailable. Fulfilment setup may be pending."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
