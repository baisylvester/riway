type Environment = Record<string, string | undefined>;

export function stripeConfiguration(env: Environment = process.env) {
  const mode = env.STRIPE_MODE ?? "test";
  if (mode !== "test" && mode !== "live")
    throw new Error("Invalid Stripe mode.");
  if (
    !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(
      env.STRIPE_SECRET_KEY ?? "",
    )
  )
    throw new Error(
      "Stripe key is missing or does not match the selected mode.",
    );
  if (!/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? ""))
    throw new Error("Stripe webhook signing secret is missing.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error("Payment database credentials are missing.");
  const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? "");
  if (
    site.protocol !== "https:" ||
    site.origin !== env.NEXT_PUBLIC_SITE_URL ||
    site.username ||
    site.password
  )
    throw new Error("Payment website must be an exact HTTPS origin.");
  const terms = env.COMMERCE_TERMS_VERSION ?? "2026-11-draft";
  const checkoutAllowed =
    !!env.PAYMENT_WORKER_SECRET &&
    env.PAYMENT_WORKER_SECRET.length >= 32 &&
    (mode === "test" ||
      (env.STRIPE_LIVE_APPROVED === "true" && !/draft/i.test(terms)));
  return {
    mode,
    livemode: mode === "live",
    site: site.origin,
    terms,
    checkoutAllowed,
    key: env.STRIPE_SECRET_KEY!,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
    databaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
    databaseKey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

export function stripeReadiness(env: Environment = process.env) {
  if (env.PAYMENT_PROVIDER !== "stripe")
    return {
      enabled: false,
      mode: "disabled",
      message: "Online ordering is not yet available.",
    };
  try {
    const config = stripeConfiguration(env);
    if (!config.checkoutAllowed)
      throw new Error("Checkout setup is incomplete.");
    return {
      enabled: true,
      mode: config.mode,
      termsVersion: config.terms,
      message: config.livemode
        ? "Pay securely with Stripe."
        : "Stripe test checkout. No real payment will be taken.",
    };
  } catch {
    return {
      enabled: false,
      mode: "incomplete",
      message: "Stripe checkout is awaiting configuration.",
    };
  }
}
