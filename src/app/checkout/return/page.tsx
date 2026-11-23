import Link from "next/link";
export const metadata = { title: "Order received" };
// Shown after Stripe returns the shopper. Payment is confirmed by the webhook,
// never by this page, so the copy does not claim that payment has succeeded.
export default function CheckoutReturn() {
  return (
    <section className="section page-section">
      <span className="eyebrow">YOUR ORDER</span>
      <h1>Thank you. We are confirming your payment.</h1>
      <p className="lead">
        Your order status updates in your account once the payment provider
        confirms payment. Please do not pay again for this order.
      </p>
      <div className="notice">
        If the status does not update, contact RIWAY support with your order
        reference.
      </div>
      <Link className="button" href="/account/orders">
        View my orders
      </Link>
    </section>
  );
}
