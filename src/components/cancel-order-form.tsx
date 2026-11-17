"use client";

import { useActionState } from "react";
import { cancelOrder } from "@/app/account/orders/actions";
import {
  cancellationActorLabels,
  type OrderCancellation,
} from "@/lib/cancellation";

// Shows the recorded cancellation, or a confirmation form while the order can
// still be cancelled. Staff must give a reason; customers may leave it blank.
export function CancelOrderForm({
  cancellation,
  staff = false,
}: {
  cancellation: OrderCancellation;
  staff?: boolean;
}) {
  const [state, action, pending] = useActionState(cancelOrder, { message: "" });
  if (cancellation.cancellation) {
    const record = cancellation.cancellation;
    return (
      <div className="notice" role="status">
        <strong>
          {staff
            ? record.cancelledBy === "staff"
              ? "Cancelled by staff"
              : "Cancelled by the customer"
            : cancellationActorLabels[record.cancelledBy]}
        </strong>{" "}
        on {new Date(record.createdAt).toLocaleString("en")}.
        {staff && record.reason && <> Reason: {record.reason}</>}
      </div>
    );
  }
  if (!cancellation.cancellable) return null;
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h3>Cancel this order</h3>
      <p className="muted">
        {staff
          ? "This unpaid order has no payment attempt. Cancelling releases its stock hold and any reserved voucher use."
          : "You haven't paid for this order yet. Cancelling releases the items for other customers and can't be undone."}
      </p>
      <input type="hidden" name="orderId" value={cancellation.orderId} />
      {staff && <input type="hidden" name="staff" value="1" />}
      <fieldset
        className="stack"
        disabled={pending || !!state.ok}
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        <label>
          {staff
            ? "Reason (recorded with the cancellation)"
            : "Reason (optional)"}
          <textarea
            name="reason"
            rows={3}
            maxLength={500}
            minLength={5}
            required={staff}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="confirmed" required />
          <span>I want to cancel this order</span>
        </label>
        <button className="button" type="submit">
          {pending ? "Cancelling…" : "Cancel order"}
        </button>
      </fieldset>
      {state.message && (
        <p className={state.ok ? "success" : "error"} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
