"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyticsConfig,
  consentCookieString,
  measurementConfigured,
  measurementCookiePattern,
  readConsentCookie,
  type AnalyticsConfig,
  type Consent,
} from "@/lib/consent";

const openEvent = "riway:cookie-settings";

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function addScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

// Google consent mode: everything denied by default, then only what was chosen.
function startGa4(id: string, consent: Consent) {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // gtag.js reads the arguments object, not an array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
  window.gtag("consent", "update", {
    analytics_storage: "granted",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", id, { anonymize_ip: true });
  addScript(
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
  );
}

function startPixel(id: string) {
  if (!window.fbq) {
    // Standard Pixel stub: queue calls until fbevents.js replaces callMethod.
    const fbq = function (...args: unknown[]) {
      const self = window.fbq!;
      if (self.callMethod) self.callMethod(...args);
      else self.queue!.push(args);
    } as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    fbq("consent", "grant");
    fbq("init", id);
  }
  window.fbq("track", "PageView");
}

function clearMeasurementCookies() {
  const host = window.location.hostname;
  const domains = [
    "",
    host,
    `.${host}`,
    `.${host.split(".").slice(-2).join(".")}`,
  ];
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (!name || !measurementCookiePattern.test(name)) continue;
    for (const domain of domains)
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
  }
}

/** Footer control that reopens the choices. Only rendered when measurement exists. */
export function CookieSettingsButton() {
  if (!measurementConfigured(analyticsConfig(publicEnv()))) return null;
  return (
    <button
      type="button"
      className="link-button"
      onClick={() => window.dispatchEvent(new Event(openEvent))}
    >
      Cookie settings
    </button>
  );
}

// NEXT_PUBLIC_* values are inlined at build time, so read them literally.
function publicEnv() {
  return {
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID,
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
  };
}

export function ConsentManager({
  config = analyticsConfig(publicEnv()),
}: {
  config?: AnalyticsConfig;
}) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const started = useRef({ ga4: false });
  const path = usePathname();
  const enabled = measurementConfigured(config);

  useEffect(() => {
    if (!enabled) return;
    const saved = readConsentCookie(document.cookie);
    setConsent(saved);
    if (!saved) setOpen(true);
    const reopen = () => {
      setCustom(true);
      setOpen(true);
    };
    window.addEventListener(openEvent, reopen);
    return () => window.removeEventListener(openEvent, reopen);
  }, [enabled]);

  // Start only what was allowed. GA4 records client navigations itself
  // (history-based page views); the Pixel gets one PageView per path.
  const { ga4, pixel } = config;
  useEffect(() => {
    if (!consent) return;
    if (ga4 && consent.analytics && !started.current.ga4) {
      started.current.ga4 = true;
      startGa4(ga4, consent);
    }
    if (pixel && consent.marketing) startPixel(pixel);
  }, [consent, ga4, pixel, path]);

  const save = useCallback(
    (next: Consent) => {
      const withdrawn =
        (consent?.analytics && !next.analytics) ||
        (consent?.marketing && !next.marketing);
      document.cookie = consentCookieString(
        next,
        window.location.protocol === "https:",
      );
      setOpen(false);
      setCustom(false);
      if (withdrawn) {
        window.gtag?.("consent", "update", {
          analytics_storage: next.analytics ? "granted" : "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
        });
        window.fbq?.("consent", "revoke");
        clearMeasurementCookies();
        // Loaded scripts cannot be unloaded; a reload starts clean.
        window.location.reload();
        return;
      }
      setConsent(next);
    },
    [consent],
  );

  if (!enabled || !open) return null;
  return (
    <div
      className="consent-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
    >
      <h2 id="consent-title">Cookie choices</h2>
      <p>
        We use necessary cookies to run this site. With your permission we would
        also use{" "}
        {[
          config.ga4 && "Google Analytics to understand how the site is used",
          config.pixel && "Meta Pixel to measure advertising",
        ]
          .filter(Boolean)
          .join(" and ")}
        . These stay off unless you allow them.{" "}
        <Link href="/legal/cookies">Cookie notice</Link>
      </p>
      {custom ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            save({
              analytics: data.get("analytics") === "on",
              marketing: data.get("marketing") === "on",
            });
          }}
        >
          <label className="checkbox">
            <input type="checkbox" checked disabled />
            <span>Necessary (always on)</span>
          </label>
          {config.ga4 && (
            <label className="checkbox">
              <input
                type="checkbox"
                name="analytics"
                defaultChecked={consent?.analytics ?? false}
              />
              <span>Analytics (Google Analytics)</span>
            </label>
          )}
          {config.pixel && (
            <label className="checkbox">
              <input
                type="checkbox"
                name="marketing"
                defaultChecked={consent?.marketing ?? false}
              />
              <span>Advertising measurement (Meta Pixel)</span>
            </label>
          )}
          <div className="consent-actions">
            <button className="button">Save choices</button>
          </div>
        </form>
      ) : (
        <div className="consent-actions">
          <button
            className="button button-outline"
            onClick={() => save({ analytics: false, marketing: false })}
          >
            Necessary only
          </button>
          <button
            className="button button-outline"
            onClick={() => setCustom(true)}
          >
            Choose
          </button>
          <button
            className="button"
            onClick={() =>
              save({ analytics: !!config.ga4, marketing: !!config.pixel })
            }
          >
            Allow all
          </button>
        </div>
      )}
    </div>
  );
}
