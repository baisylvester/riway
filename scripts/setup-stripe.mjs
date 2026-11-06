import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stripeConfiguration } from "../src/lib/stripe-config.ts";

// Keys stay in the ignored env file, memory and Wrangler stdin, never argv/logs.
// Does not enable commerce or modify market approvals/prices/stock.
process.loadEnvFile(".env.local");
const file = resolve(".env.local");
function save(values) {
  let text = readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n\0]/.test(value)) throw Error("Invalid setting format");
    const pattern = new RegExp(`^${key}=.*$`, "m"),
      line = `${key}=${JSON.stringify(value)}`;
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : text.trimEnd() + "\n" + line + "\n";
    process.env[key] = value;
  }
  writeFileSync(file + ".stripe-tmp", text, { mode: 0o600 });
  renameSync(file + ".stripe-tmp", file);
}
if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY ?? ""))
  throw Error(
    "Enter a Stripe test key through the local provider setup first.",
  );
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-10-28.endive",
  httpClient: Stripe.createFetchHttpClient(),
  maxNetworkRetries: 2,
  timeout: 10000,
  telemetry: false,
});
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
if (
  site.protocol !== "https:" ||
  site.origin !== process.env.NEXT_PUBLIC_SITE_URL
)
  throw Error("Configure the exact HTTPS RIWAY site origin first.");
const url = site.origin + "/api/webhooks/payments";
if (process.argv.includes("--configure-webhook")) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (endpoint.url === url && endpoint.status === "enabled")
        throw Error(
          "An endpoint already exists. Enter its signing secret through local setup; it cannot be retrieved or silently rotated.",
        );
    }
    const endpoint = await stripe.webhookEndpoints.create({
      url,
      api_version: "2026-10-28.endive",
      enabled_events: [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
      ],
      description: "RIWAY sandbox checkout verification",
    });
    if (!endpoint.secret)
      throw Error("Stripe did not return a signing secret.");
    save({ STRIPE_WEBHOOK_SECRET: endpoint.secret });
    console.log(
      "Created sandbox webhook; signing secret saved locally and redacted.",
    );
  } else console.log("Existing webhook signing secret retained.");
}
if (!process.env.PAYMENT_WORKER_SECRET)
  save({ PAYMENT_WORKER_SECRET: randomBytes(32).toString("hex") });
save({ STRIPE_MODE: "test", STRIPE_LIVE_APPROVED: "false" });
const config = stripeConfiguration(process.env);
if (process.argv.includes("--publish-secrets")) {
  const secrets = {
    STRIPE_SECRET_KEY: config.key,
    STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    SUPABASE_SERVICE_ROLE_KEY: config.databaseKey,
    PAYMENT_WORKER_SECRET: process.env.PAYMENT_WORKER_SECRET,
  };
  const result = spawnSync(
    process.execPath,
    [resolve("node_modules/wrangler/bin/wrangler.js"), "secret", "bulk"],
    {
      input: JSON.stringify(secrets),
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: resolve(".cache/wrangler/logs"),
        WRANGLER_CACHE_DIR: resolve(".cache/wrangler"),
      },
    },
  );
  if (result.status !== 0)
    throw Error(
      "Cloudflare secret provisioning failed. No credential values are displayed.",
    );
  console.log(
    "Published four server-only secrets. Checkout and market approval flags remain unchanged.",
  );
} else
  console.log(
    "Stripe test configuration validated. No Worker settings or commerce flags changed.",
  );
