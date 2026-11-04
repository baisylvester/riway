import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/data";
import { money } from "@/lib/domain";
import { Reorder } from "@/components/reorder";
export default async function Order({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client, user } = await requireSession();
  const { data: o } = await client
    .from("orders")
    .select("*,order_items(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!o) notFound();
  return (
    <div className="panel">
      <h2>Order {id.slice(0, 8).toUpperCase()}</h2>
      <p>
        <span className="status">{o.status}</span> Payment: {o.payment_status}
      </p>
      {o.order_items.map(
        (i: {
          id: string;
          product_name: string;
          quantity: number;
          unit_minor: number;
        }) => (
          <div key={i.id} className="order-row">
            <span>
              {i.product_name} × {i.quantity}
            </span>
            <span>{money(i.unit_minor * i.quantity, o.currency)}</span>
          </div>
        ),
      )}
      <p className="price">Total {money(o.total_minor, o.currency)}</p>
      <Reorder items={o.order_items
        .filter((i: { product_id: string | null }) => i.product_id)
        .map((i: { product_id: string; quantity: number }) => ({
          productId: i.product_id,
          quantity: i.quantity,
        }))} />
    </div>
  );
}
