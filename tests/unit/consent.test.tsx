import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import {
  analyticsConfig,
  consentCookieString,
  measurementConfigured,
  measurementCookiePattern,
  measurementCspOrigins,
  parseConsent,
  readConsentCookie,
  serializeConsent,
} from "../../src/lib/consent";
import {
  ConsentManager,
  CookieSettingsButton,
} from "../../src/components/consent-manager";

describe("analytics configuration", () => {
  it("accepts only well-formed GA4 and Pixel IDs", () => {
    expect(
      analyticsConfig({
        NEXT_PUBLIC_GA4_MEASUREMENT_ID: " G-ABC1234 ",
        NEXT_PUBLIC_META_PIXEL_ID: "123456789012",
      }),
    ).toEqual({ ga4: "G-ABC1234", pixel: "123456789012" });
    expect(
      analyticsConfig({
        NEXT_PUBLIC_GA4_MEASUREMENT_ID: "UA-1234-1",
        NEXT_PUBLIC_META_PIXEL_ID: "12;alert(1)",
      }),
    ).toEqual({ ga4: null, pixel: null });
    expect(measurementConfigured(analyticsConfig({}))).toBe(false);
  });

  it("opens the CSP only for configured providers", () => {
    expect(measurementCspOrigins({ ga4: null, pixel: null })).toEqual({
      script: [],
      connect: [],
      img: [],
    });
    const ga4 = measurementCspOrigins({ ga4: "G-ABC1234", pixel: null });
    expect(ga4.script).toEqual(["https://www.googletagmanager.com"]);
    expect(ga4.connect.join(" ")).not.toContain("facebook");
    const pixel = measurementCspOrigins({ ga4: null, pixel: "123456789" });
    expect(pixel.script).toEqual(["https://connect.facebook.net"]);
    expect(pixel.connect.join(" ")).not.toContain("google");
  });
});

describe("consent cookie", () => {
  it("round-trips choices and ignores unknown or old values", () => {
    const value = serializeConsent({ analytics: true, marketing: false });
    expect(value).toBe("v1.a1.m0");
    expect(parseConsent(value)).toEqual({ analytics: true, marketing: false });
    for (const bad of [undefined, "", "v0.a1.m1", "v1.a2.m0", "yes"])
      expect(parseConsent(bad)).toBeNull();
  });

  it("reads the consent cookie among others", () => {
    expect(
      readConsentCookie("riway-market=PH; riway-consent=v1.a0.m1; _ga=GA1.1"),
    ).toEqual({ analytics: false, marketing: true });
    expect(readConsentCookie("riway-market=PH")).toBeNull();
  });

  it("writes a first-party, lax, six-month cookie", () => {
    const cookie = consentCookieString(
      { analytics: false, marketing: false },
      true,
    );
    expect(cookie).toContain("riway-consent=v1.a0.m0");
    expect(cookie).toContain(`Max-Age=${180 * 24 * 60 * 60}`);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(
      consentCookieString({ analytics: true, marketing: true }, false),
    ).not.toContain("Secure");
  });

  it("identifies only measurement cookies for removal", () => {
    for (const name of ["_ga", "_ga_ABC123", "_gid", "_gat_UA", "_fbp", "_fbc"])
      expect(measurementCookiePattern.test(name)).toBe(true);
    for (const name of [
      "riway-consent",
      "riway-market",
      "sb-access-token",
      "_gacha",
    ])
      expect(measurementCookiePattern.test(name)).toBe(false);
  });
});

describe("consent components", () => {
  it("render nothing without configured measurement", () => {
    expect(
      renderToStaticMarkup(
        <ConsentManager config={{ ga4: null, pixel: null }} />,
      ),
    ).toBe("");
    expect(renderToStaticMarkup(<CookieSettingsButton />)).toBe("");
  });

  it("does not render the banner or load scripts during server render", () => {
    // The banner opens in the browser after reading the cookie, so the
    // server markup is empty and no third-party script is emitted.
    const html = renderToStaticMarkup(
      <ConsentManager config={{ ga4: "G-ABC1234", pixel: "123456789" }} />,
    );
    expect(html).toBe("");
    expect(html).not.toContain("googletagmanager");
  });
});
