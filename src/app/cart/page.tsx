import { catalogue, currentMarket } from "@/lib/data";
import { Cart } from "@/components/cart";
export const metadata = { title: "Your bag" };
export default async function CartPage() {
  const data = await catalogue(),
    market = await currentMarket();
  return (
    <section className="section page-section">
      <span className="eyebrow">YOUR COLLECTION</span>
      <h1>Your bag.</h1>
      <Cart {...data} market={market} />
    </section>
  );
}
