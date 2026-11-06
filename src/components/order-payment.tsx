"use client";
import { useState } from "react";
export function OrderPayment({
  orderId,
  phase,
  mode,
  enabled,
}: {
  orderId: string;
  phase?: string;
  mode?: boolean;
  enabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="stack">
      {phase && (
        <p>
          {mode === false ? "Test payment · " : ""}Stripe: {phase}
        </p>
      )}
      {phase === "review" && (
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
      {enabled && (!phase || phase === "preparing" || phase === "open") && (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await fetch("/api/payments/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
              });
              const data = await r.json();
              if (r.ok && typeof data.url === "string") {
                const url = new URL(data.url, window.location.origin);
                if (
                  (url.protocol === "https:" &&
                    url.hostname === "checkout.stripe.com") ||
                  url.origin === window.location.origin
                ) {
                  window.location.assign(url.href);
                  return;
                }
              }
              setMessage(data.error?.message ?? "Checkout is unavailable.");
            } catch {
              setMessage("Checkout could not be reached. Try again later.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening…" : "Resume secure payment"}
        </button>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
