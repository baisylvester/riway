// Cookie consent for optional measurement. Analytics (GA4) and marketing
// (Meta Pixel) are off until the visitor opts in, and only exist when RIWAY's
// IDs are configured at build time. Necessary cookies need no consent.

export const consentCookie = "riway-consent";
export const consentMaxAgeSeconds = 180 * 24 * 60 * 60;
export const consentVersion = 1;

export type Consent = { analytics: boolean; marketing: boolean };
export type AnalyticsConfig = { ga4: string | null; pixel: string | null };

const ga4Pattern = /^G-[A-Z0-9]{4,20}$/;
const pixelPattern = /^\d{6,20}$/;

export function analyticsConfig(
  env: Record<string, string | undefined>,
): AnalyticsConfig {
  const ga4 = env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() ?? "";
  const pixel = env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";
  return {
    ga4: ga4Pattern.test(ga4) ? ga4 : null,
    pixel: pixelPattern.test(pixel) ? pixel : null,
  };
}

export const measurementConfigured = (config: AnalyticsConfig) =>
  !!(config.ga4 || config.pixel);

/** "v1.a1.m0" style value; anything else (or an old version) means no choice yet. */
export function parseConsent(value: string | undefined | null): Consent | null {
  const match = /^v(\d+)\.a([01])\.m([01])$/.exec(value ?? "");
  if (!match || Number(match[1]) !== consentVersion) return null;
  return { analytics: match[2] === "1", marketing: match[3] === "1" };
}

export function serializeConsent(consent: Consent) {
  return `v${consentVersion}.a${consent.analytics ? 1 : 0}.m${consent.marketing ? 1 : 0}`;
}

export function readConsentCookie(cookieHeader: string): Consent | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === consentCookie) return parseConsent(rest.join("="));
  }
  return null;
}

export function consentCookieString(consent: Consent, secure: boolean) {
  return `${consentCookie}=${serializeConsent(consent)}; Max-Age=${consentMaxAgeSeconds}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Measurement cookies to clear when consent is withdrawn. */
export const measurementCookiePattern = /^(_ga(_.*)?|_gid|_gat.*|_fbp|_fbc)$/;

/** Origins the Content-Security-Policy must allow for configured providers. */
export function measurementCspOrigins(config: AnalyticsConfig) {
  const script: string[] = [],
    connect: string[] = [],
    img: string[] = [];
  if (config.ga4) {
    script.push("https://www.googletagmanager.com");
    connect.push(
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://www.googletagmanager.com",
    );
    img.push(
      "https://*.google-analytics.com",
      "https://www.googletagmanager.com",
    );
  }
  if (config.pixel) {
    script.push("https://connect.facebook.net");
    connect.push("https://www.facebook.com", "https://connect.facebook.net");
    img.push("https://www.facebook.com");
  }
  return { script, connect, img };
}
