import { currentMarket } from "@/lib/data";
import { db } from "@/lib/supabase/server";
import { Checkout } from "@/components/checkout";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
import { eligibleChannels } from "@/lib/xendit-channels";
export const metadata = { title: "Checkout review" };
export default async function CheckoutPage() {
  const market = await currentMarket();
  const readiness = xenditReadiness();
  let channels: ReturnType<typeof eligibleChannels> = [];
  if (readiness.enabled) {
    // Only channels a RIWAY admin enabled for this market (after confirming
    // them in the Xendit dashboard) and that Xendit documents for the country.
    const enabled = await (
      await db()
    )
      .rpc("xendit_checkout_channels", {
        p_market: market,
        p_live: readiness.livemode,
      })
      .then(
        (r) => (Array.isArray(r.data) ? (r.data as string[]) : []),
        () => [],
      );
    channels = eligibleChannels(market, enabled);
  }
  return (
    <section className="section page-section">
      <span className="eyebrow">A CONSIDERED NEXT STEP</span>
      <h1>Checkout review.</h1>
      <Checkout
        market={market}
        payment={stripeReadiness()}
        xendit={{
          enabled: readiness.enabled && channels.length > 0,
          message: readiness.message,
          termsVersion: readiness.termsVersion,
          channels,
        }}
      />
    </section>
  );
}
