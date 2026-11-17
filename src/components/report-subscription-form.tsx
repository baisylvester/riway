"use client";

import { useActionState } from "react";
import { saveReportSubscription } from "@/app/admin/report-actions";
import {
  frequencyLabels,
  type ReportSubscriptions,
} from "@/lib/report-subscriptions";

function MarketSchedule({ market, frequency }: ReportSubscriptions[number]) {
  const [state, action, pending] = useActionState(saveReportSubscription, {
    message: "",
  });
  return (
    <form action={action} className="admin-actions" aria-busy={pending}>
      <input type="hidden" name="market" value={market} />
      <label>
        {market}
        <select name="frequency" defaultValue={frequency ?? "off"}>
          <option value="off">Off</option>
          <option value="weekly">{frequencyLabels.weekly}</option>
          <option value="monthly">{frequencyLabels.monthly}</option>
        </select>
      </label>
      <button className="button button-outline" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      <span role="status">{state.message}</span>
    </form>
  );
}

// Emailed sales summaries for the signed-in staff member only.
export function ReportSubscriptionForm({
  subscriptions,
  emailEnabled,
}: {
  subscriptions: ReportSubscriptions;
  emailEnabled: boolean;
}) {
  return (
    <section className="panel stack">
      <h2>Scheduled email reports</h2>
      <p className="muted">
        Receive a sales summary (totals and top products, with a link back to
        this page) for each market you manage. Reports cover settled orders by
        UTC order date and are sent to your account email.
      </p>
      {!emailEnabled && (
        <p className="notice">
          Email delivery is not switched on yet. Your schedule is saved and
          reports start once RIWAY enables email.
        </p>
      )}
      {subscriptions.map((s) => (
        <MarketSchedule key={s.market} {...s} />
      ))}
    </section>
  );
}
