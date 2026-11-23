import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { xenditConfiguration } from "@/lib/xendit-config";
import { channelRejection } from "@/lib/xendit-channels";
import type { Market } from "@/lib/domain";

// Xendit Payment Sessions, hosted PAYMENT_LINK mode.
//   create:  POST /sessions             https://docs.xendit.co/apidocs/create-session
//   get:     GET  /sessions/{id}        https://docs.xendit.co/apidocs/get-session
//   cancel:  POST /sessions/{id}/cancel https://docs.xendit.co/apidocs/cancel-session
//   routing: for-user-id header        https://docs.xendit.co/docs/accepting-payments-for-sub-accounts
//   webhook: x-callback-token header   https://docs.xendit.co/docs/handling-webhooks
// Auth is HTTP Basic with the secret key as username and an empty password
// (https://docs.xendit.co/apidocs/quick-setup.md).

const sessionIdPattern = /^ps-[A-Za-z0-9_-]{6,64}$/;
const subAccountPattern = /^[A-Za-z0-9_-]{8,64}$/;
const checkoutHosts = new Set([
  "checkout.xendit.co",
  "checkout-staging.xendit.co",
  "xen.to",
  "dev.xen.to",
]);

export class XenditUncertainError extends Error {}
export class XenditRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Xendit request failed (${status} ${code}).`);
  }
}

export const xenditAttemptSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  attemptNo: z.number().int().min(1).max(5),
  livemode: z.boolean(),
  subAccountId: z.string().regex(subAccountPattern).nullable(),
  channel: z.string().regex(/^[A-Z0-9_]{2,40}$/),
  country: z.enum(["PH", "SG", "MY"]),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.enum(["PHP", "SGD", "MYR"]),
  items: z
    .array(
      z.object({
        referenceId: z.uuid(),
        name: z.string().min(1).max(140),
        category: z.string().min(1).max(60),
        amount: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(30),
  origin: z.url().refine((v) => {
    const u = new URL(v);
    return u.protocol === "https:" && u.origin === v;
  }),
  expiresAt: z.iso.datetime(),
  sessionId: z.string().regex(sessionIdPattern).nullable(),
  url: z.string().nullable(),
  phase: z.enum(["preparing", "open", "paid", "expired", "canceled", "review"]),
});
export type XenditAttempt = z.infer<typeof xenditAttemptSchema>;

const sessionSchema = z.object({
  payment_session_id: z.string().regex(sessionIdPattern),
  reference_id: z.string(),
  status: z.enum(["ACTIVE", "COMPLETED", "EXPIRED", "CANCELED"]),
  session_type: z.string(),
  currency: z.string(),
  amount: z.number().nonnegative(),
  country: z.string().optional(),
  payment_link_url: z.string().nullish(),
  payment_id: z.string().nullish(),
});
export type XenditSession = z.infer<typeof sessionSchema>;

// All three currencies have two decimal places. Amounts are integers in
// minor units everywhere in RIWAY; only the API boundary uses major units.
export function toMajor(minor: number) {
  if (!Number.isSafeInteger(minor) || minor <= 0)
    throw new Error("Invalid amount.");
  return Number(
    `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`,
  );
}
export function toMinor(major: number) {
  const minor = Math.round(major * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(major * 100 - minor) > 1e-6)
    throw new Error("Amount has more than two decimals.");
  return minor;
}

export function xenditClients() {
  const config = xenditConfiguration();
  const database = createClient(config.databaseUrl, config.databaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { config, database, fetch: globalThis.fetch.bind(globalThis) };
}
export type XenditClients = {
  config: ReturnType<typeof xenditConfiguration>;
  database: Pick<SupabaseClient, "rpc" | "from">;
  fetch: typeof fetch;
};

async function xenditRequest(
  clients: XenditClients,
  method: "GET" | "POST",
  path: string,
  { body, forUserId }: { body?: unknown; forUserId?: string | null } = {},
) {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${clients.config.key}:`)}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (forUserId) {
    if (!subAccountPattern.test(forUserId))
      throw new Error("Invalid sub-account routing.");
    headers["for-user-id"] = forUserId;
  }
  let response: Response;
  try {
    response = await clients.fetch(`${clients.config.apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      // Cloudflare Workers reject redirect: "error" (only "follow" and
      // "manual" exist there). Never follow a redirect with credentials;
      // an unexpected redirect is handled below as an uncertain outcome.
      redirect: "manual",
    });
  } catch {
    // A timeout never proves the request was not processed.
    throw new XenditUncertainError("Xendit did not answer.");
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (
    response.status >= 500 ||
    (response.status >= 300 && response.status < 400) ||
    response.type === "opaqueredirect"
  )
    throw new XenditUncertainError("Xendit unavailable.");
  if (!response.ok) {
    const raw = (data as { error_code?: unknown })?.error_code;
    const code =
      typeof raw === "string" && /^[A-Z0-9_]{1,64}$/.test(raw)
        ? raw
        : "UNKNOWN";
    throw new XenditRequestError(response.status, code);
  }
  return data;
}

export function checkedXenditUrl(value: string | null | undefined) {
  if (!value) throw new Error("Xendit checkout is unavailable.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !checkoutHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Invalid checkout destination.");
  return url.href;
}

export function sessionParameters(attempt: XenditAttempt) {
  if (attempt.items.reduce((n, i) => n + i.amount, 0) !== attempt.amount)
    throw new Error("Payment total does not match order.");
  const order = attempt.orderId.slice(0, 8).toUpperCase();
  return {
    reference_id: attempt.id,
    session_type: "PAY",
    mode: "PAYMENT_LINK",
    amount: toMajor(attempt.amount),
    currency: attempt.currency,
    country: attempt.country,
    capture_method: "AUTOMATIC",
    allow_save_payment_method: "DISABLED",
    // The customer's channel/bank choice from RIWAY checkout. The hosted page
    // offers only this channel.
    allowed_payment_channels: [attempt.channel],
    expires_at: attempt.expiresAt,
    description: `RIWAY order ${order}`,
    locale: "en",
    items: attempt.items.map((i) => ({
      reference_id: i.referenceId,
      type: "PHYSICAL_PRODUCT",
      name: i.name,
      net_unit_amount: toMajor(i.amount),
      quantity: 1,
      category: i.category,
    })),
    metadata: { order_id: attempt.orderId, attempt_id: attempt.id },
    success_return_url: `${attempt.origin}/account/orders/${attempt.orderId}?payment=return`,
    cancel_return_url: `${attempt.origin}/account/orders/${attempt.orderId}?payment=cancelled`,
  };
}

function checkedSession(
  data: unknown,
  attempt: Pick<XenditAttempt, "id" | "amount" | "currency" | "country">,
) {
  const session = sessionSchema.parse(data);
  if (
    session.reference_id !== attempt.id ||
    session.session_type !== "PAY" ||
    session.currency !== attempt.currency ||
    (session.country !== undefined && session.country !== attempt.country) ||
    toMinor(session.amount) !== attempt.amount
  )
    throw new Error("Xendit session does not match order.");
  return session;
}

async function prepare(
  clients: XenditClients,
  orderId: string,
  userId: string,
  channel: string,
) {
  const prepared = await clients.database.rpc("prepare_xendit_payment", {
    p_order: orderId,
    p_user: userId,
    p_live: clients.config.livemode,
    p_origin: clients.config.site,
    p_channel: channel,
  });
  if (prepared.error) throw new Error("Order cannot be prepared for payment.");
  const attempt = xenditAttemptSchema.parse(prepared.data);
  if (attempt.livemode !== clients.config.livemode)
    throw new Error("Payment mode mismatch.");
  return attempt;
}

/** Check the selected channel against trusted order data before preparing. */
async function rejectIneligibleChannel(
  clients: XenditClients,
  orderId: string,
  userId: string,
  channel: string,
) {
  const order = await clients.database
    .from("orders")
    .select("id,user_id,market,total_minor")
    .eq("id", orderId)
    .maybeSingle();
  if (order.error || !order.data || order.data.user_id !== userId)
    throw new Error("Order unavailable.");
  const enabled = await clients.database.rpc("xendit_checkout_channels", {
    p_market: order.data.market,
    p_live: clients.config.livemode,
  });
  if (enabled.error || !Array.isArray(enabled.data))
    throw new Error("Payment methods are unavailable.");
  const reason = channelRejection(
    order.data.market as Market,
    channel,
    enabled.data as string[],
    Number(order.data.total_minor),
  );
  if (reason) throw new XenditChannelError(reason);
}
export class XenditChannelError extends Error {}

export async function startXenditCheckout(
  orderId: string,
  userId: string,
  channel: string,
  clients: XenditClients = xenditClients(),
): Promise<{ orderId: string; url: string; state: string }> {
  await rejectIneligibleChannel(clients, orderId, userId, channel);
  let attempt = await prepare(clients, orderId, userId, channel);
  const orderPage = `${attempt.origin}/account/orders/${orderId}`;
  if (attempt.phase === "paid" || attempt.phase === "review")
    return { orderId, url: orderPage, state: attempt.phase };
  if (attempt.channel !== channel) {
    // The customer chose another channel. Only a session Xendit confirms as
    // CANCELED is replaced; an unknown or completed one is reconciled instead.
    if (attempt.phase !== "open" || !attempt.sessionId)
      throw new Error("A payment is still being confirmed for this order.");
    try {
      const cancelled = await xenditRequest(
        clients,
        "POST",
        `/sessions/${attempt.sessionId}/cancel`,
        { forUserId: attempt.subAccountId },
      );
      if (checkedSession(cancelled, attempt).status !== "CANCELED")
        throw new Error("Session was not cancelled.");
    } catch (error) {
      if (error instanceof XenditRequestError && error.status === 422) {
        await reconcileXenditAttempt(
          attempt.id,
          `switch-${attempt.id}`,
          clients,
        );
        return { orderId, url: orderPage, state: "processing" };
      }
      throw error;
    }
    const superseded = await clients.database.rpc("supersede_xendit_payment", {
      p_attempt: attempt.id,
      p_session: attempt.sessionId,
    });
    if (superseded.error)
      throw new Error("Payment change could not be recorded.");
    attempt = await prepare(clients, orderId, userId, channel);
    if (attempt.channel !== channel)
      throw new Error("A payment is still being confirmed for this order.");
  }
  if (attempt.phase === "expired" || attempt.phase === "canceled")
    throw new Error(
      "This checkout has closed. Review your orders before starting again.",
    );
  if (attempt.sessionId && attempt.url)
    return {
      orderId,
      url: checkedXenditUrl(attempt.url),
      state: attempt.phase,
    };
  if (!clients.config.checkoutAllowed)
    throw new Error("New payment sessions are disabled.");
  // Never send an expiry that has passed or is about to; the abandoned-order
  // sweep closes an unconfirmed attempt after its expiry instead.
  if (Date.parse(attempt.expiresAt) - Date.now() < 2 * 60 * 1000)
    throw new Error(
      "This checkout has closed. Review your orders before starting again.",
    );
  // reference_id is the attempt id. If this call times out, the attempt stays
  // "preparing" and is retried with the same reference; a session created by a
  // lost request was never shown to anyone, cannot be paid, and expires.
  let raw: unknown;
  try {
    raw = await xenditRequest(clients, "POST", "/sessions", {
      body: sessionParameters(attempt),
      forUserId: attempt.subAccountId,
    });
  } catch (error) {
    // A definitive refusal (e.g. channel not activated for this account)
    // created nothing payable: close the attempt so another channel can be
    // chosen. Rate limits, conflicts and 5xx stay uncertain and are retried.
    if (
      error instanceof XenditRequestError &&
      [400, 401, 403, 404, 422].includes(error.status)
    ) {
      const rejected = await clients.database.rpc("reject_xendit_payment", {
        p_attempt: attempt.id,
        p_code: error.code,
      });
      if (rejected.error)
        throw new Error("Payment change could not be recorded.");
      throw new XenditChannelError(
        "This payment method could not be opened. Choose another payment method.",
      );
    }
    throw error;
  }
  const created = checkedSession(raw, attempt);
  if (created.status !== "ACTIVE")
    throw new Error("Xendit session is not open.");
  const url = checkedXenditUrl(created.payment_link_url);
  const bound = await clients.database.rpc("bind_xendit_payment", {
    p_attempt: attempt.id,
    p_session: created.payment_session_id,
    p_url: url,
  });
  if (bound.error)
    throw new Error("Payment session could not be recorded. Retry this order.");
  return { orderId, url, state: "open" };
}

/** Fetch canonical session state in the attempt's own account context and
 * apply it atomically. The payload of a webhook is never trusted for status,
 * amount or routing. */
export async function reconcileXenditAttempt(
  attemptId: string,
  eventKey: string,
  clients: XenditClients = xenditClients(),
  sessionId?: string,
) {
  const context = await clients.database.rpc("xendit_payment_context", {
    p_attempt: attemptId,
  });
  if (context.error) throw new Error("Payment lookup failed.");
  if (!context.data) return "unknown";
  const attempt = z
    .object({
      id: z.uuid(),
      orderId: z.uuid(),
      livemode: z.boolean(),
      subAccountId: z.string().regex(subAccountPattern).nullable(),
      sessionId: z.string().regex(sessionIdPattern).nullable(),
    })
    .parse(context.data);
  if (attempt.livemode !== clients.config.livemode)
    throw new Error("Payment mode mismatch.");
  const target = sessionId ?? attempt.sessionId;
  if (!target || !sessionIdPattern.test(target)) return "unbound";
  // Routed with the stored account: a session that belongs to another account
  // is not found under this for-user-id and is never applied.
  const raw = await xenditRequest(clients, "GET", `/sessions/${target}`, {
    forUserId: attempt.subAccountId,
  });
  const session = sessionSchema.parse(raw);
  if (session.reference_id !== attempt.id || session.session_type !== "PAY")
    throw new Error("Payment reference mismatch.");
  const result = await clients.database.rpc("apply_xendit_payment_event", {
    p_event: eventKey.slice(0, 255),
    p_attempt: attempt.id,
    p_order: attempt.orderId,
    p_session: session.payment_session_id,
    p_live: clients.config.livemode,
    p_amount: toMinor(session.amount),
    p_currency: session.currency,
    p_status: session.status,
    p_payment:
      session.status === "COMPLETED" ? (session.payment_id ?? null) : null,
  });
  if (result.error) throw new Error("Payment reconciliation required.");
  return result.data as string;
}

export function verifyCallbackToken(received: string | null, expected: string) {
  const a = Buffer.from(received ?? ""),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const webhookSchema = z.object({
  event: z.string().max(80),
  data: z
    .object({
      payment_session_id: z.string().regex(sessionIdPattern),
      reference_id: z.string().max(64),
    })
    .passthrough(),
});

export function parseSessionWebhook(body: string) {
  return webhookSchema.parse(JSON.parse(body));
}

export async function cancelXenditSession(
  sessionId: string,
  subAccountId: string | null,
  clients: XenditClients,
) {
  if (!sessionIdPattern.test(sessionId)) throw new Error("Invalid session.");
  await xenditRequest(clients, "POST", `/sessions/${sessionId}/cancel`, {
    forUserId: subAccountId,
  });
}
