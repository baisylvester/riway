import { currentMarket, session } from "@/lib/data";
import { GuestCheckout } from "@/components/guest-checkout";
import { authProvider } from "@/lib/auth-config";
import { centreSchema } from "@/lib/checkout-fulfilment";
import { db } from "@/lib/supabase/server";
import { Checkout } from "@/components/checkout";
import { stripeReadiness } from "@/lib/stripe-config";
import { xenditReadiness } from "@/lib/xendit-config";
import { eligibleChannels } from "@/lib/xendit-channels";
export const metadata = { title: "Checkout review" };
export default async function CheckoutPage() {
  const market = await currentMarket();
  const { user } = await session();
  const centresResult = await (
    await db()
  )
    .from("service_centres")
    .select(
      "id,market,name,line1,city,postal_code,instructions,active,revision",
    )
    .eq("market", market)
    .eq("active", true)
    .order("name");
  const centres = centreSchema.array().safeParse(centresResult.data);
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
      {!user && authProvider() === "supabase" && <GuestCheckout />}
      <Checkout
        market={market}
        centres={centres.success ? centres.data : []}
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
