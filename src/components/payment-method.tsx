"use client";
import {
  amountEligible,
  channelGroups,
  type ChannelGroup,
  type XenditChannel,
} from "@/lib/xendit-channels";
import type { PaymentSelection } from "@/lib/domain";

export type Gateway = "stripe" | "xendit";

/** Gateway → method → bank selection. Amount filtering here is display only;
 * the server re-checks channel, amount and routing before any payment. */
export function PaymentMethodPicker({
  gateways,
  channels,
  totalMinor,
  value,
  onChange,
  disabled,
}: {
  gateways: Gateway[];
  channels: XenditChannel[];
  totalMinor: number;
  value: {
    gateway: Gateway;
    group: ChannelGroup | null;
    channel: string | null;
  };
  onChange: (next: {
    gateway: Gateway;
    group: ChannelGroup | null;
    channel: string | null;
  }) => void;
  disabled?: boolean;
}) {
  const usable = channels.filter((c) => amountEligible(c, totalMinor));
  const groups = [...new Set(usable.map((c) => c.group))];
  const inGroup = usable.filter((c) => c.group === value.group);
  const group = value.group ? channelGroups[value.group] : null;
  return (
    <fieldset className="stack payment-choice" disabled={disabled}>
      <legend>Payment</legend>
      {gateways.length > 1 && (
        <div role="radiogroup" aria-label="Payment gateway" className="stack">
          {gateways.map((g) => (
            <label key={g} className="checkbox">
              <input
                type="radio"
                name="gateway"
                value={g}
                checked={value.gateway === g}
                onChange={() =>
                  onChange({ gateway: g, group: null, channel: null })
                }
              />
              <span>
                {g === "stripe"
                  ? "Card via Stripe"
                  : "Xendit: e-wallet, QR, online banking or card"}
              </span>
            </label>
          ))}
        </div>
      )}
      {value.gateway === "xendit" &&
        (groups.length ? (
          <>
            <div
              role="radiogroup"
              aria-label="Payment method"
              className="stack"
            >
              {groups.map((g) => (
                <label key={g} className="checkbox">
                  <input
                    type="radio"
                    name="paymentGroup"
                    value={g}
                    checked={value.group === g}
                    onChange={() => {
                      const options = usable.filter((c) => c.group === g);
                      onChange({
                        gateway: "xendit",
                        group: g,
                        // Single-option methods need no second choice.
                        channel:
                          !channelGroups[g].bankSelection &&
                          options.length === 1
                            ? options[0].code
                            : null,
                      });
                    }}
                  />
                  <span>{channelGroups[g].label}</span>
                </label>
              ))}
            </div>
            {group &&
              (group.bankSelection ? (
                <label>
                  Bank
                  <select
                    name="paymentChannel"
                    required
                    value={value.channel ?? ""}
                    onChange={(e) =>
                      onChange({ ...value, channel: e.target.value || null })
                    }
                  >
                    <option value="">Choose your bank</option>
                    {inGroup.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                inGroup.length > 1 && (
                  <label>
                    {group.label}
                    <select
                      name="paymentChannel"
                      required
                      value={value.channel ?? ""}
                      onChange={(e) =>
                        onChange({ ...value, channel: e.target.value || null })
                      }
                    >
                      <option value="">Choose</option>
                      {inGroup.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ))}
            {group && <p className="small muted">{group.instructions}</p>}
          </>
        ) : (
          <p className="small muted">
            No Xendit payment method is available for this order total.
          </p>
        ))}
    </fieldset>
  );
}

export function selectionPayload(value: {
  gateway: Gateway;
  channel: string | null;
}): PaymentSelection | null {
  if (value.gateway === "stripe") return { gateway: "stripe" };
  return value.channel ? { gateway: "xendit", channel: value.channel } : null;
}

export function allowedPaymentRedirect(href: string, origin: string) {
  const url = new URL(href, origin);
  return url.origin === origin ||
    (url.protocol === "https:" &&
      !url.port &&
      [
        "checkout.stripe.com",
        "checkout.xendit.co",
        "checkout-staging.xendit.co",
        "xen.to",
        "dev.xen.to",
      ].includes(url.hostname))
    ? url.href
    : null;
}
