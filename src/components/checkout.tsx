"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { useStore } from "./store-provider";
import { markets, type Market } from "@/lib/domain";
import {
  commerceQuoteSchema,
  quoteFingerprint,
  quoteSelection,
  type CommerceQuote,
} from "@/lib/commerce-checkout";
import { CheckoutQuote } from "./checkout-quote";
import { TrackBeginCheckout } from "./commerce-tracking";
import { MembershipConsentFields } from "./membership-consent";
import {
  PaymentMethodPicker,
  allowedPaymentRedirect,
  selectionPayload,
  type Gateway,
} from "./payment-method";
import type { ChannelGroup, XenditChannel } from "@/lib/xendit-channels";
export function Checkout({
  market,
  payment = {
    enabled: false,
    mode: "disabled",
    message: "Online ordering is not yet available.",
  },
  xendit = { enabled: false, message: "", channels: [] },
}: {
  market: Market;
  payment?: {
    enabled: boolean;
    mode: string;
    message: string;
    termsVersion?: string;
  };
  xendit?: {
    enabled: boolean;
    message: string;
    termsVersion?: string;
    channels: XenditChannel[];
  };
}) {
  const gateways: Gateway[] = [
    ...(payment.enabled ? (["stripe"] as const) : []),
    ...(xendit.enabled ? (["xendit"] as const) : []),
  ];
  const enabled = gateways.length > 0;
  const termsVersion = payment.enabled
    ? payment.termsVersion
    : xendit.termsVersion;
  const [method, setMethod] = useState<{
    gateway: Gateway;
    group: ChannelGroup | null;
    channel: string | null;
  }>({ gateway: gateways[0] ?? "stripe", group: null, channel: null });
  const statusId = useId();
  const attempt = useRef({ payload: "", key: "" });
  const { items } = useStore(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [quoted, setQuoted] = useState<{
    fingerprint: string;
    quote: CommerceQuote;
  } | null>(null);
  const quoteRequest = useRef(0);
  const fingerprint = quoteFingerprint(market, items, code);
  const currentQuote =
    quoted?.fingerprint === fingerprint ? quoted.quote : null;
  async function review() {
    const sequence = ++quoteRequest.current;
    const selected = quoteSelection(market, items, code);
    const selectedFingerprint = JSON.stringify(selected);
    setBusy(true);
    setMessage("");
    setQuoted(null);
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(
          body.error?.message ?? "The current total could not be reviewed.",
        );
      const result = commerceQuoteSchema.safeParse(body);
      if (!result.success || result.data.market !== market)
        throw Error("The order review could not be verified.");
      if (sequence === quoteRequest.current) {
        setQuoted({ fingerprint: selectedFingerprint, quote: result.data });
        setMessage("Review the current total before continuing to payment.");
      }
    } catch (error) {
      if (sequence === quoteRequest.current) {
        setQuoted(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Order review could not be reached. Please try again.",
        );
      }
    } finally {
      if (sequence === quoteRequest.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enabled && !currentQuote) {
      await review();
      return;
    }
    const selection = enabled ? selectionPayload(method) : undefined;
    if (selection === null) {
      setMessage("Choose a payment method and bank before continuing.");
      return;
    }
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
        termsVersion,
        promotionCode: quoteSelection(market, items, code).promotionCode,
        quoteHash: currentQuote?.quoteHash,
        membershipConsent: currentQuote?.membership
          ? {
              ruleId: currentQuote.membership.ruleId,
              termsVersion: currentQuote.membership.termsVersion,
              codeVersion: currentQuote.membership.codeVersion,
              accepted: f.get("membershipConsent") === "on",
            }
          : undefined,
      };
      // The payment choice is not part of the order: changing the method or
      // bank reuses the same order instead of creating a second one.
      const fingerprint = JSON.stringify(payload);
      if (attempt.current.payload !== fingerprint)
        attempt.current = { payload: fingerprint, key: crypto.randomUUID() };
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          payment: selection,
          idempotencyKey: attempt.current.key,
        }),
      });
      const d = await r.json();
      if (r.ok && typeof d.url === "string") {
        const href = allowedPaymentRedirect(d.url, window.location.origin);
        if (href) {
          window.location.assign(href);
          return;
        }
      }
      setMessage(
        d.error?.message ??
          "Payment is not confirmed here. Check your orders before trying again.",
      );
      if (enabled && r.status === 409) setQuoted(null);
    } catch {
      setMessage(
        "Checkout could not be reached. Check your orders before trying again.",
      );
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
      <TrackBeginCheckout
        currency={markets[market].currency}
        items={items.map((i) => ({
          id: i.productId,
          name: "",
          quantity: i.quantity,
        }))}
      />
      <div className="panel stack">
        <h2>Delivery details</h2>
        <p className="muted small">
          {[payment.message, xendit.enabled ? xendit.message : ""]
            .filter(Boolean)
            .join(" ")}
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
        <p>
          {items.length} product{" "}
          {items.length === 1 ? "selection" : "selections"}
        </p>
        <label>
          Voucher code (optional)
          <input
            name="promotionCode"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={40}
            disabled={busy}
            autoComplete="off"
          />
        </label>
        <p className="small muted">
          One eligible voucher can be used per order.
        </p>
        <button
          type="button"
          className="button button-outline"
          disabled={busy || !items.length}
          onClick={() => void review()}
        >
          Review current total
        </button>
        {currentQuote && <CheckoutQuote quote={currentQuote} />}
        {currentQuote?.membership && (
          <MembershipConsentFields
            key={currentQuote.quoteHash}
            qualification={currentQuote.membership}
          />
        )}
        {enabled && currentQuote && (
          <PaymentMethodPicker
            gateways={gateways}
            channels={xendit.channels}
            totalMinor={currentQuote.totalMinor}
            value={method}
            onChange={setMethod}
            disabled={busy}
          />
        )}
        {!currentQuote && quoted && (
          <p className="notice">
            Your selection changed. Review the current total again.
          </p>
        )}
        <div className="notice">
          {enabled
            ? "Market approval, verified sponsor, approved pricing and stock are checked before payment opens. Card, wallet and bank details are entered only on Stripe or Xendit, never on RIWAY."
            : "Sales are closed pending policy and regulatory approvals. No card details or payment are collected."}{" "}
          No approved therapeutic claims.
        </div>
        <label className="checkbox">
          <input name="terms" type="checkbox" required />
          <span>
            {enabled ? (
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
            : !enabled
              ? "Check ordering availability"
              : method.gateway === "xendit"
                ? "Continue to Xendit"
                : "Continue to Stripe"}
        </button>
        <p id={statusId} role="status">
          {message}
        </p>
      </aside>
    </form>
  );
}
