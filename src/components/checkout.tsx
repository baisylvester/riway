"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { markets, type Market } from "@/lib/domain";
export function Checkout({
  market,
  payment = {
    enabled: false,
    mode: "disabled",
    message: "Online ordering is not yet available.",
  },
}: {
  market: Market;
  payment?: {
    enabled: boolean;
    mode: string;
    message: string;
    termsVersion?: string;
  };
}) {
  const statusId = useId();
  const attempt = useRef({ payload: "", key: "" });
  const { items } = useStore(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const address = Object.fromEntries(
        ["full_name", "phone", "line1", "city", "postal_code"].map((k) => [
          k,
          f.get(k),
        ]),
      );
      const payload = {
        market,
        items,
        address: { ...address, country: market },
        terms: f.get("terms") === "on",
        termsVersion: payment.termsVersion,
      };
      const fingerprint = JSON.stringify(payload);
      if (attempt.current.payload !== fingerprint)
        attempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: attempt.current.key,
        }),
      });
      const d = await r.json();
      if (r.ok && typeof d.url === "string") {
        const url = new URL(d.url, window.location.origin);
        if (
          (url.protocol === "https:" &&
            url.hostname === "checkout.stripe.com") ||
          url.origin === window.location.origin
        ) {
          window.location.assign(url.href);
          return;
        }
      }
      setMessage(d.error?.message ?? "No payment has been taken.");
    } catch {
      setMessage("Checkout could not be reached. No payment has been taken.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      aria-describedby={statusId}
      aria-busy={busy}
      onSubmit={submit}
      className="two-column"
    >
      <div className="panel stack">
        <h2>Delivery details</h2>
        <p className="muted small">{payment.message}</p>
        <div className="form-grid">
          {[
            ["full_name", "Full name"],
            ["phone", "Phone"],
            ["line1", "Street address"],
            ["city", "City"],
            ["postal_code", "Postal code"],
          ].map(([name, label]) => (
            <label key={name} className={name === "line1" ? "full" : ""}>
              {label}
              <input
                aria-describedby={message ? statusId : undefined}
                name={name}
                required
                autoComplete={
                  {
                    full_name: "name",
                    phone: "tel",
                    line1: "address-line1",
                    city: "address-level2",
                    postal_code: "postal-code",
                  }[name]
                }
                maxLength={name === "line1" ? 200 : 100}
              />
            </label>
          ))}
          <label>
            Delivery country
            <input readOnly value={markets[market].name} />
          </label>
        </div>
      </div>
      <aside className="panel stack">
        <h2>Order review</h2>
        <p>{items.length} product selections</p>
        <div className="notice">
          {payment.enabled
            ? "Market approval, verified sponsor, approved pricing and stock are checked before Stripe opens. Card details are entered only on Stripe."
            : "Sales are closed pending policy and regulatory approvals. No card details or payment are collected."}{" "}
          No approved therapeutic claims.
        </div>
        <label className="checkbox">
          <input name="terms" type="checkbox" required />
          <span>
            {payment.enabled ? (
              <>
                I accept the <a href="/legal/terms">Terms of Sale</a> and{" "}
                <a href="/legal/conduct">Code of Conduct</a>.
              </>
            ) : (
              "I understand ordering is unavailable and these are draft terms for review."
            )}
          </span>
        </label>
        <button className="button" disabled={busy || !items.length}>
          {busy
            ? "Checking…"
            : payment.enabled
              ? "Continue to Stripe"
              : "Check ordering availability"}
        </button>
        <p id={statusId} role="status">
          {message}
        </p>
      </aside>
    </form>
  );
}
