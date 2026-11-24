import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/data";
import { money } from "@/lib/domain";
import { Reorder } from "@/components/reorder";
import { OrderPayment } from "@/components/order-payment";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
import { catalogueChannel, eligibleChannels } from "@/lib/xendit-channels";
import { asMarket } from "@/lib/domain";
import { orderFulfilmentSchema, orderStatusLabels } from "@/lib/fulfilment";
import { FulfilmentTimeline } from "@/components/fulfilment-timeline";
import { orderCancellationSchema } from "@/lib/cancellation";
import { CancelOrderForm } from "@/components/cancel-order-form";
import { TrackPurchase } from "@/components/commerce-tracking";
export const metadata = { title: "Order details" };
export default async function Order({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const returned = (await searchParams)?.payment === "return";
  if (!z.uuid().safeParse(id).success) notFound();
  const { client, user } = await requireSession();
  const { data: o } = await client
    .from("orders")
    .select("*,order_items(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!o) notFound();
  const stripe = await client.rpc("stripe_checkout_status", { p_order: id });
  const xendit = await client.rpc("xendit_payment_status", { p_order: id });
  const gateway = !xendit.error && xendit.data ? "xendit" : "stripe";
  const payment = gateway === "xendit" ? xendit : stripe;
  const unpaid =
    o.status === "awaiting_payment" && o.payment_status === "pending";
  const market = asMarket(o.market);
  // Other channels the customer may switch to, if this order is still open.
  const switchable =
    gateway === "xendit" && unpaid && xenditReadiness().enabled
      ? eligibleChannels(
          market,
          await client
            .rpc("xendit_checkout_channels", {
              p_market: market,
              p_live: xendit.data.livemode,
            })
            .then((r) => (Array.isArray(r.data) ? (r.data as string[]) : [])),
          Number(o.total_minor),
        ).map((c) => ({ code: c.code, label: c.label }))
      : [];
  // Delivery progress appears once payment is confirmed; a missing or
  // unexpected response simply omits it rather than breaking the order page.
  const fulfilment =
    o.payment_status === "paid"
      ? orderFulfilmentSchema.safeParse(
          (await client.rpc("order_fulfilment", { p_order: id })).data,
        )
      : null;
  // Cancellation state; a missing or unexpected response omits the section.
  const cancellation = ["awaiting_payment", "cancelled"].includes(o.status)
    ? orderCancellationSchema.safeParse(
        (await client.rpc("order_cancellation", { p_order: id })).data,
      )
    : null;
  return (
    <div className="panel">
      <h2>Order {id.slice(0, 8).toUpperCase()}</h2>
      <p>
        <span className="status">
          {orderStatusLabels[o.status] ?? o.status}
        </span>{" "}
        Payment: {o.payment_status}
      </p>
      {fulfilment?.success && fulfilment.data.orderId === id && (
        <FulfilmentTimeline fulfilment={fulfilment.data} />
      )}
      {o.order_items.map(
        (i: {
          id: string;
          product_name: string;
          quantity: number;
          unit_minor: number;
          discount_minor?: number;
          net_minor?: number;
        }) => (
          <div key={i.id} className="order-row">
            <span>
              {i.product_name} × {i.quantity}
            </span>
            <span>
              {money(i.net_minor ?? i.unit_minor * i.quantity, o.currency)}
              {!!i.discount_minor && (
                <small> · Discount {money(i.discount_minor, o.currency)}</small>
              )}
            </span>
          </div>
        ),
      )}
      {!!o.discount_minor && (
        <p>
          Subtotal {money(o.subtotal_minor, o.currency)} · Discount{" "}
          {money(o.discount_minor, o.currency)}
        </p>
      )}
      <p className="price">Total {money(o.total_minor, o.currency)}</p>
      {/* Conversion is reported only from the server-verified paid state. */}
      {o.payment_status === "paid" && (
        <TrackPurchase
          orderId={id}
          currency={o.currency}
          valueMinor={Number(o.total_minor)}
          items={o.order_items
            .filter((i: { product_id: string | null }) => i.product_id)
            .map(
              (i: {
                product_id: string;
                product_name: string;
                quantity: number;
                unit_minor: number;
              }) => ({
                id: i.product_id,
                name: i.product_name,
                quantity: i.quantity,
                priceMinor: i.unit_minor,
              }),
            )}
        />
      )}
      {o.payment_status !== "paid" && o.status === "awaiting_payment" && (
        <p>
          Your order is awaiting payment confirmation. Returning from checkout
          does not confirm payment.
        </p>
      )}
      <OrderPayment
        orderId={id}
        gateway={gateway}
        phase={payment.data?.phase}
        mode={payment.data?.livemode}
        channel={
          gateway === "xendit" && payment.data?.channel
            ? (catalogueChannel(market, payment.data.channel)?.label ??
              payment.data.channel)
            : undefined
        }
        expiresAt={gateway === "xendit" ? payment.data?.expiresAt : undefined}
        returned={returned}
        channels={switchable}
        enabled={
          (gateway === "xendit"
            ? xenditReadiness().enabled
            : stripeReadiness().enabled) && unpaid
        }
      />
      {cancellation?.success && cancellation.data.orderId === id && (
        <CancelOrderForm cancellation={cancellation.data} />
      )}
      {o.payment_status === "paid" &&
        ["paid", "fulfilling"].includes(o.status) && (
          <p className="muted">
            Need to cancel a paid order? Contact RIWAY support before it is
            dispatched.
          </p>
        )}
      <Reorder
        items={o.order_items
          .filter((i: { product_id: string | null }) => i.product_id)
          .map((i: { product_id: string; quantity: number }) => ({
            productId: i.product_id,
            quantity: i.quantity,
          }))}
      />
    </div>
  );
}
