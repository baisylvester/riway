"use client";
import { useActionState } from "react";
import { saveXenditRouting } from "@/app/admin/payments/xendit-actions";
import { markets, type Market } from "@/lib/domain";
import { channelGroups, xenditChannels } from "@/lib/xendit-channels";

export interface XenditRouting {
  market: Market;
  livemode: boolean;
  account_type: "MASTER" | "OWNED" | "MANAGED";
  sub_account_id: string | null;
  account_status: string | null;
  enabled_channels: string[];
  payments_enabled: boolean;
}

export function XenditRoutingForm({
  market,
  livemode,
  current,
}: {
  market: Market;
  livemode: boolean;
  current?: XenditRouting;
}) {
  const [s, a, p] = useActionState(saveXenditRouting, { message: "" });
  const enabled = new Set(current?.enabled_channels ?? []);
  return (
    <form className="panel stack" action={a}>
      <h3>
        {markets[market].name} · {livemode ? "Live" : "Test"}
      </h3>
      <input type="hidden" name="market" value={market} />
      <input type="hidden" name="livemode" value={livemode ? "live" : "test"} />
      <div className="form-grid">
        <label>
          Processing account
          <select
            name="accountType"
            defaultValue={
              current?.account_type ?? (livemode ? "OWNED" : "MASTER")
            }
          >
            {!livemode && (
              <option value="MASTER">RIWAY master account (test only)</option>
            )}
            <option value="OWNED">xenPlatform owned sub-account</option>
            <option value="MANAGED">xenPlatform managed sub-account</option>
          </select>
        </label>
        <label>
          Sub-account ID (for-user-id)
          <input
            name="subAccountId"
            defaultValue={current?.sub_account_id ?? ""}
            pattern="[A-Za-z0-9_-]{8,64}"
            placeholder="Leave empty for the master account"
          />
        </label>
        <label>
          Sub-account status in Xendit
          <select
            name="accountStatus"
            defaultValue={current?.account_status ?? ""}
          >
            <option value="">— (master account)</option>
            {[
              "LIVE",
              "REGISTERED",
              "AWAITING_DOCS",
              "PENDING_VERIFICATION",
              "AWAITING_RESUBMISSION",
              "SUSPENDED",
              "DECLINED",
              "DORMANT",
              "CLOSED",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="stack">
        <legend>
          Channels enabled in the Xendit dashboard for this account
        </legend>
        {xenditChannels[market].length ? (
          xenditChannels[market].map((c) => (
            <label key={c.code} className="checkbox">
              <input
                type="checkbox"
                name="channels"
                value={c.code}
                defaultChecked={enabled.has(c.code)}
              />
              <span>
                {c.label}{" "}
                <small className="muted">
                  ({channelGroups[c.group].label}, {c.code})
                </small>
              </span>
            </label>
          ))
        ) : (
          <p className="small muted">
            No Xendit channel is documented for this market yet. Confirm
            availability with Xendit before enabling it.
          </p>
        )}
      </fieldset>
      <label className="checkbox">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={current?.payments_enabled ?? false}
        />
        <span>Offer Xendit at checkout for this market</span>
      </label>
      <button className="button" disabled={p}>
        {p ? "Saving…" : "Save routing"}
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
