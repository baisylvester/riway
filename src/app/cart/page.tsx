import { catalogue, currentMarket } from "@/lib/data";
import { Cart } from "@/components/cart";
import { Ui } from "@/components/locale-provider";
import { currentLocale } from "@/lib/locale-server";
export const metadata = { title: "Your bag" };
export default async function CartPage() {
  const data = await catalogue(),
    market = await currentMarket();
  return (
    <section className="section page-section" lang={await currentLocale()}>
      <span className="eyebrow">
        <Ui id="yourCollection" />
      </span>
      <h1>
        <Ui id="yourBag" />
      </h1>
      <Cart {...data} market={market} />
    </section>
  );
}
