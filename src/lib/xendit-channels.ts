// Xendit Payment Sessions channel catalogue.
//
// Source: https://docs.xendit.co/docs/available-payment-methods (read 2026-11-23).
// Xendit documents no API that lists the channels enabled on an account, so a
// channel is offered only when it is BOTH in this catalogue AND switched on for
// the market by a RIWAY admin (private.xendit_market_accounts.enabled_channels)
// after confirming it in Dashboard > Settings > Payment methods.
//
// Limits are in minor units. `null` means the documentation read did not state
// a limit; Xendit still validates the amount when the session is created.
// Singapore is intentionally empty: the channel page had no Singapore section,
// so no SG channel is claimed until Xendit confirms one for RIWAY's account.
// Direct-debit channels are left out because they need customer account
// linking, which this checkout does not implement.
import type { Market } from "./domain";

export type ChannelGroup =
  "CARDS" | "EWALLET" | "QR" | "ONLINE_BANKING" | "FPX";

export interface XenditChannel {
  code: string;
  label: string;
  group: ChannelGroup;
  minMinor: number | null;
  maxMinor: number | null;
}

export const channelGroups: Record<
  ChannelGroup,
  { label: string; bankSelection: boolean; instructions: string }
> = {
  CARDS: {
    label: "Credit or debit card",
    bankSelection: false,
    instructions: "Enter your card details on the secure Xendit page.",
  },
  EWALLET: {
    label: "E-wallet",
    bankSelection: false,
    instructions: "You will be sent to your e-wallet to approve the payment.",
  },
  QR: {
    label: "QR payment",
    bankSelection: false,
    instructions:
      "Scan the QR code shown on the Xendit page with your banking or e-wallet app.",
  },
  ONLINE_BANKING: {
    label: "Online banking",
    bankSelection: true,
    instructions:
      "You will sign in to your chosen bank's own website or app to approve this payment. RIWAY never sees or stores your bank login.",
  },
  FPX: {
    label: "FPX online banking",
    bankSelection: true,
    instructions:
      "You will sign in to your chosen bank through FPX to approve this payment. RIWAY never sees or stores your bank login.",
  },
};

const php = (major: number) => major * 100;

export const xenditChannels: Record<Market, XenditChannel[]> = {
  PH: [
    {
      code: "CARDS",
      label: "Card",
      group: "CARDS",
      minMinor: php(20),
      maxMinor: php(700000),
    },
    {
      code: "GCASH",
      label: "GCash",
      group: "EWALLET",
      minMinor: php(1),
      maxMinor: php(100000),
    },
    {
      code: "PAYMAYA",
      label: "Maya",
      group: "EWALLET",
      minMinor: php(1),
      maxMinor: php(100000),
    },
    {
      code: "GRABPAY",
      label: "GrabPay",
      group: "EWALLET",
      minMinor: php(1),
      maxMinor: php(100000),
    },
    {
      code: "SHOPEEPAY",
      label: "ShopeePay",
      group: "EWALLET",
      minMinor: php(1),
      maxMinor: php(100000),
    },
    {
      code: "QRPH",
      label: "QR Ph",
      group: "QR",
      minMinor: php(1),
      maxMinor: php(50000),
    },
    {
      code: "BDO_ONLINE_BANKING",
      label: "BDO",
      group: "ONLINE_BANKING",
      minMinor: php(1),
      maxMinor: php(2000000),
    },
    {
      code: "BPI_ONLINE_BANKING",
      label: "BPI",
      group: "ONLINE_BANKING",
      minMinor: php(1),
      maxMinor: php(250000),
    },
    {
      code: "UNIONBANK_ONLINE_BANKING",
      label: "UnionBank",
      group: "ONLINE_BANKING",
      minMinor: php(1),
      maxMinor: php(100000),
    },
    {
      code: "METROBANK_ONLINE_BANKING",
      label: "Metrobank",
      group: "ONLINE_BANKING",
      minMinor: null,
      maxMinor: null,
    },
    {
      code: "RCBC_ONLINE_BANKING",
      label: "RCBC",
      group: "ONLINE_BANKING",
      minMinor: null,
      maxMinor: null,
    },
    {
      code: "PNB_ONLINE_BANKING",
      label: "PNB",
      group: "ONLINE_BANKING",
      minMinor: null,
      maxMinor: null,
    },
    {
      code: "CHINABANK_ONLINE_BANKING",
      label: "Chinabank",
      group: "ONLINE_BANKING",
      minMinor: null,
      maxMinor: null,
    },
    {
      code: "MAYBANK_ONLINE_BANKING",
      label: "Maybank Philippines",
      group: "ONLINE_BANKING",
      minMinor: null,
      maxMinor: null,
    },
  ],
  SG: [],
  MY: [
    {
      code: "CARDS",
      label: "Card",
      group: "CARDS",
      minMinor: 100,
      maxMinor: 500000,
    },
    {
      code: "GRABPAY",
      label: "GrabPay",
      group: "EWALLET",
      minMinor: 100,
      maxMinor: 150000,
    },
    {
      code: "TOUCHNGO",
      label: "Touch 'n Go eWallet",
      group: "EWALLET",
      minMinor: 100,
      maxMinor: 2000000,
    },
    {
      code: "SHOPEEPAY",
      label: "ShopeePay",
      group: "EWALLET",
      minMinor: 100,
      maxMinor: 499900,
    },
    ...(
      [
        ["AFFIN_FPX", "Affin Bank"],
        ["AMBANK_FPX", "AmBank"],
        ["BOC_FPX", "Bank of China"],
        ["BSN_FPX", "BSN"],
        ["CIMB_FPX", "CIMB Clicks"],
        ["HLB_FPX", "Hong Leong Bank"],
        ["HSBC_FPX", "HSBC"],
        ["ISLAM_FPX", "Bank Islam"],
        ["KFH_FPX", "Kuwait Finance House"],
        ["MAYB2U_FPX", "Maybank2u"],
        ["OCBC_FPX", "OCBC"],
        ["PUBLIC_FPX", "Public Bank"],
        ["RHB_FPX", "RHB"],
        ["UOB_FPX", "UOB"],
      ] as const
    ).map(([code, label]) => ({
      code,
      label,
      group: "FPX" as const,
      minMinor: 100,
      maxMinor: 3000000,
    })),
  ],
};

export function catalogueChannel(market: Market, code: string) {
  return xenditChannels[market].find((c) => c.code === code) ?? null;
}

export function amountEligible(channel: XenditChannel, amountMinor: number) {
  return (
    (channel.minMinor === null || amountMinor >= channel.minMinor) &&
    (channel.maxMinor === null || amountMinor <= channel.maxMinor)
  );
}

/** Channels that are documented, enabled for the market and fit the amount. */
export function eligibleChannels(
  market: Market,
  enabledCodes: readonly string[],
  amountMinor?: number,
) {
  const enabled = new Set(enabledCodes);
  return xenditChannels[market].filter(
    (c) =>
      enabled.has(c.code) &&
      (amountMinor === undefined || amountEligible(c, amountMinor)),
  );
}

/** Server-side check before any payment is created. Returns a reason or null. */
export function channelRejection(
  market: Market,
  code: string,
  enabledCodes: readonly string[],
  amountMinor: number,
) {
  const channel = catalogueChannel(market, code);
  if (!channel || !enabledCodes.includes(code))
    return "This payment method is not available for your market.";
  if (!amountEligible(channel, amountMinor))
    return `${channel.label} cannot be used for this order total. Choose another payment method.`;
  return null;
}
