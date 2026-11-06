import { currentMarket } from "@/lib/data";
import { Checkout } from "@/components/checkout";
import { stripeReadiness } from "@/lib/stripe-config";
export const metadata = { title: "Checkout review" };
export default async function CheckoutPage() {
  return (
    <section className="section page-section">
      <span className="eyebrow">A CONSIDERED NEXT STEP</span>
      <h1>Checkout review.</h1>
      <Checkout market={await currentMarket()} payment={stripeReadiness()} />
    </section>
  );
}
