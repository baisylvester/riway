"use client";

import { useActionState, useState } from "react";
import { advanceOrderFulfilment } from "@/app/admin/fulfilment-actions";
import {
  fulfilmentStepLabels,
  nextFulfilmentStep,
  type OrderFulfilment,
} from "@/lib/fulfilment";

export function FulfilmentForm({
  fulfilment,
}: {
  fulfilment: OrderFulfilment;
}) {
  const [state, action, pending] = useActionState(advanceOrderFulfilment, {
    message: "",
  });
  const [method, setMethod] = useState<"courier" | "collection">("courier");
  const step =
    fulfilment.paymentStatus === "paid"
      ? nextFulfilmentStep[fulfilment.status]
      : undefined;
  if (!step)
    return (
      <p className="muted">
        {fulfilment.status === "delivered"
          ? "This order is complete."
          : "No fulfilment step is available for this order's current payment and status."}
      </p>
    );
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h3>Next step: {fulfilmentStepLabels[step]}</h3>
      <input type="hidden" name="orderId" value={fulfilment.orderId} />
      <input type="hidden" name="status" value={step} />
      <fieldset
        className="stack"
        disabled={pending || !!state.ok}
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        {step === "shipped" && (
          <>
            <label>
              Dispatch method
              <select
                name="method"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as "courier" | "collection")
                }
              >
                <option value="courier">Courier delivery</option>
                <option value="collection">Service-centre collection</option>
              </select>
            </label>
            {method === "courier" && (
              <>
                <label>
                  Carrier
                  <input name="carrier" required minLength={2} maxLength={80} />
                </label>
                <label>
                  Tracking number
                  <input
                    name="trackingNumber"
                    required
                    maxLength={64}
                    pattern="[A-Za-z0-9][A-Za-z0-9 \-]{2,62}[A-Za-z0-9]"
                  />
                </label>
                <label>
                  Tracking link (optional)
                  <input
                    name="trackingUrl"
                    type="url"
                    maxLength={500}
                    pattern="https://.+"
                    placeholder="https://"
                  />
                </label>
              </>
            )}
          </>
        )}
        <label>
          {step === "shipped" && method === "collection"
            ? "Service-centre collection details"
            : "Note for the customer (optional)"}
          <textarea
            name="note"
            maxLength={500}
            rows={3}
            required={step === "shipped" && method === "collection"}
          />
        </label>
        <label className="checkbox">
          <input name="confirmed" type="checkbox" required />
          <span>
            This update is shown to the customer and cannot be undone here.
          </span>
        </label>
        <button className="button">
          {pending ? "Saving…" : `Mark as ${fulfilmentStepLabels[step].toLowerCase()}`}
        </button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}
