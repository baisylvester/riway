"use client";
import { useId, useState, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { markets, type Market } from "@/lib/domain";
export function Checkout({ market }: { market: Market }) {
  const statusId = useId();
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
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          items,
          address: { ...address, country: market },
          terms: f.get("terms") === "on",
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const d = await r.json();
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
        <p className="muted small">
          You can review the form. Ordering and payment are currently
          unavailable.
        </p>
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
          Sales are closed pending policy and regulatory approvals. No approved
          therapeutic claims. No card details or payment are collected.
        </div>
        <label className="checkbox">
          <input name="terms" type="checkbox" required />
          <span>
            I understand ordering is unavailable and these are draft terms for
            review.
          </span>
        </label>
        <button className="button" disabled={busy || !items.length}>
          {busy ? "Checking…" : "Check ordering availability"}
        </button>
        <p id={statusId} role="status">
          {message}
        </p>
      </aside>
    </form>
  );
}
