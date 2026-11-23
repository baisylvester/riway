"use client";
import { useState } from "react";
import { allowedPaymentRedirect } from "./payment-method";

// Customer-facing payment states. Only the server-verified phase is shown;
// returning from the provider never confirms payment by itself.
const xenditMessages: Record<string, string> = {
  preparing: "Your payment is being set up.",
  open: "Awaiting payment.",
  paid: "Payment confirmed.",
  expired:
    "This payment expired before it was completed. The order was released; place a new order to buy these items.",
  canceled: "This payment was cancelled.",
  review: "Payment needs review. Contact support and do not pay again.",
};

export function OrderPayment({
  orderId,
  gateway = "stripe",
  phase,
  mode,
  channel,
  expiresAt,
  returned,
  channels = [],
  enabled,
}: {
  orderId: string;
  gateway?: "stripe" | "xendit";
  phase?: string;
  mode?: boolean;
  channel?: string;
  expiresAt?: string;
  returned?: boolean;
  channels?: { code: string; label: string }[];
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [next, setNext] = useState("");
  const open = !phase || phase === "preparing" || phase === "open";
  async function resume(channelCode?: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/payments/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, channel: channelCode }),
      });
      const data = await r.json();
      if (r.ok && typeof data.url === "string") {
        const href = allowedPaymentRedirect(data.url, window.location.origin);
        if (href) {
          window.location.assign(href);
          return;
        }
      }
      setMessage(data.error?.message ?? "Checkout is unavailable.");
    } catch {
      setMessage("Checkout could not be reached. Try again later.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      {phase && gateway === "stripe" && (
        <p>
          {mode === false ? "Test payment · " : ""}Stripe: {phase}
        </p>
      )}
      {phase && gateway === "xendit" && (
        <p>
          {mode === false ? "Test payment · " : ""}Xendit
          {channel ? ` · ${channel}` : ""}: {xenditMessages[phase] ?? phase}
          {open && expiresAt && (
            <>
              {" "}
              Complete it before{" "}
              {new Date(expiresAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </>
          )}
        </p>
      )}
      {gateway === "xendit" && returned && open && (
        <p role="status">
          We are waiting for Xendit to confirm your payment. Refresh this page
          in a minute; do not pay again.
        </p>
      )}
      {phase === "review" && gateway === "stripe" && (
        <p role="status">
          Payment needs review. Contact support and do not pay again.
        </p>
      )}
      {phase === "processing" && (
        <p role="status">
          Payment is processing. Refresh this order for updates; do not pay
          again.
        </p>
      )}
      {enabled && open && (
        <button className="button" disabled={busy} onClick={() => resume()}>
          {busy ? "Opening…" : "Resume secure payment"}
        </button>
      )}
      {enabled && open && gateway === "xendit" && channels.length > 1 && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (next) void resume(next);
          }}
        >
          <label>
            Use a different payment method
            <select
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose</option>
              {channels
                .filter((c) => c.label !== channel)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
            </select>
          </label>
          <p className="small muted">
            Your current payment link is cancelled with Xendit before a new one
            opens, so this order cannot be paid twice.
          </p>
          <button className="button button-outline" disabled={busy || !next}>
            Switch payment method
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
