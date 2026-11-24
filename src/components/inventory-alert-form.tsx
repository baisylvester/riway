"use client";

import { useActionState } from "react";
import { saveInventoryAlertSubscription } from "@/app/admin/inventory-alert-actions";
import type { InventoryAlertSubscriptions } from "@/lib/inventory-alerts";

function MarketAlert({
  market,
  subscribed,
}: InventoryAlertSubscriptions[number]) {
  const [state, action, pending] = useActionState(
    saveInventoryAlertSubscription,
    { message: "" },
  );
  return (
    <form action={action} className="admin-actions" aria-busy={pending}>
      <input type="hidden" name="market" value={market} />
      <label>
        {market}
        <select name="enabled" defaultValue={subscribed ? "on" : "off"}>
          <option value="off">Off</option>
          <option value="on">Daily summary</option>
        </select>
      </label>
      <button className="button button-outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <span role="status">{state.message}</span>
    </form>
  );
}

// Daily corporate checkout-stock alert for the signed-in staff member only.
export function InventoryAlertForm({
  subscriptions,
  emailEnabled,
}: {
  subscriptions: InventoryAlertSubscriptions;
  emailEnabled: boolean;
}) {
  return (
    <section className="panel stack">
      <h2>Low-stock email alerts</h2>
      <p className="muted">
        Once a day, receive the checkout stock records at or below their
        threshold for each market you manage. Store-owner (tenant) inventory has
        its own report.
      </p>
      {!emailEnabled && (
        <p className="notice">
          Email delivery is not switched on yet. Your choice is saved and alerts
          start once RIWAY enables email.
        </p>
      )}
      {subscriptions.map((s) => (
        <MarketAlert key={s.market} {...s} />
      ))}
    </section>
  );
}
