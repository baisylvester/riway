import { configuredSiteUrl } from "./site-url";

type Environment = Record<string, string | undefined>;

/** Gateways switched on by configuration. `PAYMENT_PROVIDERS` (comma list)
 * supersedes the older single-value `PAYMENT_PROVIDER`. */
export function configuredGateways(env: Environment = process.env) {
  const raw = env.PAYMENT_PROVIDERS || env.PAYMENT_PROVIDER || "disabled";
  return new Set(
    raw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v === "stripe" || v === "xendit"),
  ) as Set<"stripe" | "xendit">;
}

export function xenditConfiguration(env: Environment = process.env) {
  const mode = env.XENDIT_MODE ?? "test";
  if (mode !== "test" && mode !== "live")
    throw new Error("Invalid Xendit mode.");
  // Xendit issues separate test and live secret keys. The development/production
  // prefixes are how the dashboard labels them; a mismatch fails closed.
  const prefix = mode === "live" ? "production" : "development";
  if (
    !new RegExp(`^xnd_${prefix}_[A-Za-z0-9]+$`).test(
      env.XENDIT_SECRET_KEY ?? "",
    )
  )
    throw new Error(
      "Xendit key is missing or does not match the selected mode.",
    );
  const token = env.XENDIT_WEBHOOK_TOKEN ?? "";
  if (token.length < 16 || /\s/.test(token))
    throw new Error("Xendit webhook verification token is missing.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error("Payment database credentials are missing.");
  const siteUrl = configuredSiteUrl(env);
  const site = new URL(siteUrl ?? "");
  if (
    site.protocol !== "https:" ||
    site.origin !== siteUrl ||
    site.username ||
    site.password
  )
    throw new Error("Payment website must be an exact HTTPS origin.");
  const terms = env.COMMERCE_TERMS_VERSION ?? "2026-11-draft";
  const checkoutAllowed =
    !!env.PAYMENT_WORKER_SECRET &&
    env.PAYMENT_WORKER_SECRET.length >= 32 &&
    (mode === "test" ||
      (env.XENDIT_LIVE_APPROVED === "true" && !/draft/i.test(terms)));
  const apiBase = env.XENDIT_API_BASE ?? "https://api.xendit.co";
  if (apiBase !== "https://api.xendit.co" && mode === "live")
    throw new Error("Live Xendit payments must use the official API host.");
  return {
    mode,
    livemode: mode === "live",
    site: site.origin,
    terms,
    checkoutAllowed,
    key: env.XENDIT_SECRET_KEY!,
    webhookToken: token,
    apiBase,
    databaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
    databaseKey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

export function xenditReadiness(env: Environment = process.env) {
  if (!configuredGateways(env).has("xendit"))
    return { enabled: false, mode: "disabled", message: "" };
  try {
    const config = xenditConfiguration(env);
    if (!config.checkoutAllowed)
      throw new Error("Checkout setup is incomplete.");
    return {
      enabled: true,
      mode: config.mode,
      livemode: config.livemode,
      termsVersion: config.terms,
      message: config.livemode
        ? "Pay with Xendit: card, e-wallet, QR or online banking."
        : "Xendit test checkout. No real payment will be taken.",
    };
  } catch {
    return {
      enabled: false,
      mode: "incomplete",
      message: "Xendit checkout is awaiting configuration.",
    };
  }
}
