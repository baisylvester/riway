import type { NextConfig } from "next";
import { analyticsConfig, measurementCspOrigins } from "./src/lib/consent";
import { nextRedirects } from "./src/lib/legacy-redirects";
function configuredOrigin(value?: string) {
  if (!value) return "";
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value)
    throw new Error("Provider CSP URLs must be HTTPS origins.");
  return url.origin;
}
const clerkOrigin =
  process.env.AUTH_PROVIDER === "clerk"
    ? configuredOrigin(process.env.CLERK_ISSUER_URL)
    : "";
if (process.env.AUTH_PROVIDER === "clerk" && !clerkOrigin)
  throw new Error("CLERK_ISSUER_URL is required for Clerk CSP.");
const r2Origin =
  process.env.R2_ACCOUNT_ID && /^[a-f0-9]{32}$/.test(process.env.R2_ACCOUNT_ID)
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "";
// Measurement providers are allowed only when their IDs are set at build time;
// the scripts themselves still load only after the visitor consents.
const measurement = measurementCspOrigins(analyticsConfig(process.env));
// Guest verification reaches the loopback Auth fixture only in a manual test build.
const manualAuthOrigin =
  process.env.RIWAY_MANUAL_SANDBOX === "1" &&
  process.env.CLOUDFLARE_BUILD !== "1" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:4682"
    ? " http://127.0.0.1:4682"
    : "";
const policy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} ${clerkOrigin ? `${clerkOrigin} https://challenges.cloudflare.com https://*.protect.clerk.com` : ""} ${measurement.script.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://static.wixstatic.com https://skiimthwadramxdzhgoy.supabase.co ${r2Origin} ${clerkOrigin ? "https://img.clerk.com" : ""} ${measurement.img.join(" ")}`,
  `connect-src 'self' https://skiimthwadramxdzhgoy.supabase.co${manualAuthOrigin} ${clerkOrigin ? `${clerkOrigin} https://*.protect.clerk.com:*` : ""} ${measurement.connect.join(" ")}`,
  `frame-src 'self' ${clerkOrigin ? "https://challenges.cloudflare.com https://*.protect.clerk.com" : ""}`,
  "worker-src 'self' blob:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const config: NextConfig = {
  // Cloudflare serves these small approved source assets directly; no paid Images binding is required.
  images: { unoptimized: process.env.CLOUDFLARE_BUILD === "1" },
  poweredByHeader: false,
  // Distributor photo uploads (up to 3 MB) go through a server action.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Approved legacy public URLs (empty until RIWAY supplies the inventory).
  async redirects() {
    return nextRedirects();
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: policy,
          },
        ],
      },
      {
        source: "/account/assistant",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
