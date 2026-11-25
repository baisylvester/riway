import "server-only";
import { Resend } from "resend";
import { z } from "zod";
import { configuredSiteUrl } from "../lib/site-url";
import { emailSenderSchema } from "../lib/email-sender";
import {
  ProviderNotConfigured,
  type TransactionalEmailProvider,
} from "./production-integrations";

const messageSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9/_:.-]+$/),
  to: z.array(z.email()).min(1).max(10),
  subject: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/),
  html: z.string().max(100000),
  text: z.string().min(1).max(100000),
  replyTo: z.email().optional(),
  headers: z
    .object({
      "List-Unsubscribe": z
        .string()
        .max(2000)
        .regex(/^[^\r\n]+$/),
      "List-Unsubscribe-Post": z.literal("List-Unsubscribe=One-Click"),
    })
    .optional(),
});

export class EmailDeliveryError extends Error {
  constructor(public readonly retryable: boolean) {
    super("Email delivery is unavailable.");
  }
}

export class ResendTransactionalEmailProvider implements TransactionalEmailProvider {
  constructor(
    private readonly client: Pick<Resend, "emails">,
    private readonly from: string,
    private readonly mode: "test" | "live",
    private readonly recipients: string[] = [],
    private readonly pause = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async send(input: Parameters<TransactionalEmailProvider["send"]>[0]) {
    const message = messageSchema.parse(input);
    if (
      this.mode === "test" &&
      message.to.some((to) => !this.recipients.includes(to.toLowerCase()))
    ) {
      throw new Error("Recipient is not in the email test allowlist.");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      let retryable = true;
      try {
        const { idempotencyKey, ...content } = message;
        const result = await this.client.emails.send(
          { from: this.from, ...content },
          { idempotencyKey, signal: AbortSignal.timeout(5000) },
        );
        if (!result.error && result.data?.id)
          return { providerMessageId: result.data.id };
        const code =
          result.error && "statusCode" in result.error
            ? Number(result.error.statusCode)
            : 0;
        retryable =
          code === 429 ||
          code >= 500 ||
          result.error?.name === "concurrent_idempotent_requests" ||
          result.error?.name === "application_error";
      } catch {
        /* Transport errors are redacted and retried with the same key. */
      }
      if (!retryable || attempt === 2) throw new EmailDeliveryError(retryable);
      await this.pause(250 * 2 ** attempt);
    }
    throw new EmailDeliveryError(true);
  }
}

export function emailProvider() {
  if (
    process.env.EMAIL_PROVIDER !== "resend" ||
    !process.env.RESEND_API_KEY ||
    !process.env.RESEND_FROM_EMAIL
  )
    throw new ProviderNotConfigured("Resend");
  const mode = process.env.EMAIL_DELIVERY_MODE || "test";
  if (mode !== "test" && mode !== "live")
    throw new Error("Invalid email delivery mode.");
  if (mode === "live" && process.env.NODE_ENV !== "production")
    throw new Error("Live email requires a production runtime.");
  const from = emailSenderSchema.parse(process.env.RESEND_FROM_EMAIL);
  return new ResendTransactionalEmailProvider(
    new Resend(process.env.RESEND_API_KEY),
    from,
    mode,
    (process.env.EMAIL_TEST_RECIPIENTS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type Notification =
  | { type: "support_received"; reference: string }
  | { type: "event_registered"; reference: string }
  | { type: "inventory_alert"; reference: string }
  | { type: "membership_requested"; reference: string }
  | { type: "membership_confirmed"; reference: string }
  | { type: "order_shipped"; reference: string }
  | { type: "order_delivered"; reference: string }
  | { type: "sales_report"; reference: string; context: unknown }
  | { type: "order_confirmed"; reference: string; context: unknown }
  | {
      type: "consultation_update" | "consultation_reminder";
      reference: string;
      context: unknown;
    }
  | { type: "reorder_reminder"; reference: string; context: unknown }
  | { type: "corporate_low_stock"; reference: string; context: unknown }
  | {
      type: "store_owner_onboarding";
      reference: string;
      tenantId: string;
      context: { store: string };
    }
  | {
      type: "low_inventory_report";
      reference: string;
      tenantId: string;
      context: {
        store: string;
        day: string;
        lowStockCount: number;
        items: {
          sku: string;
          location: string;
          available: number;
          threshold: number;
        }[];
      };
    };

function escaped(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

export function reportDate(now: Date, timezone = "Asia/Shanghai", hour = 9) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => local.find((p) => p.type === type)?.value;
  if (Number(part("hour")) < hour) return null;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const salesReportContext = z.object({
  market: z.enum(["PH", "SG", "MY"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  frequency: z.enum(["weekly", "monthly"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orders: z.number().int().nonnegative(),
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  totalMinor: z.number().int(),
  topProducts: z
    .array(
      z.object({
        name: z.string().max(120),
        units: z.number().int().nonnegative(),
        netMinor: z.number().int(),
      }),
    )
    .max(5),
});

function minorAmount(minor: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    minor / 100,
  );
}

// Frozen order snapshot queued by private.enqueue_order_confirmation. It holds
// no address, phone or email; the recipient comes from the verified account.
const orderConfirmedContext = z.object({
  bonusItems: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(24),
        returnTerms: z.string().min(20).max(2000),
      }),
    )
    .max(30)
    .optional(),
  orderId: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().positive(),
  placedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(24),
        netMinor: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(30),
});

const corporateLowStockContext = z.object({
  market: z.enum(["PH", "SG", "MY"]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lowStockCount: z.number().int().positive(),
  items: z
    .array(
      z.object({
        product: z.string().min(1).max(120),
        available: z.number().int(),
        threshold: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
});

// Statements already used on product pages. Market-approved receipt wording
// replaces these once RIWAY supplies it; nothing here is a therapeutic claim.
const orderStatements: Record<"PH" | "SG" | "MY", string[]> = {
  PH: [
    "No approved therapeutic claims. Read the label and consult a healthcare professional.",
  ],
  SG: [],
  MY: [],
};

function siteOrigin() {
  const origin = new URL(configuredSiteUrl() || "http://127.0.0.1:4173");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw new Error("Invalid notification site URL");
  return origin.origin;
}

export function notificationContent(notification: Notification) {
  if (notification.type === "reorder_reminder") {
    const c = z
      .object({
        orderId: z.uuid(),
        market: z.enum(["PH", "SG", "MY"]),
        unsubscribeToken: z.uuid(),
      })
      .parse(notification.context);
    const link = new URL(`/account/orders/${c.orderId}`, siteOrigin()).href;
    const unsubscribe = new URL(
      `/api/preferences/unsubscribe?token=${c.unsubscribeToken}`,
      siteOrigin(),
    ).href;
    const subject = "Review your RIWAY reorder";
    const text = `It may be time to review your previous purchase, based on RIWAY-approved product timing.\nSign in to review products and copy them to your bag: ${link}\nThis does not place an order, start a subscription or authorize payment. Review current prices and availability at checkout.\nStop optional reorder emails: ${unsubscribe}`;
    const statements = orderStatements[c.market];
    return {
      subject,
      text: [text, ...statements].join("\n"),
      html: `<h1>${subject}</h1><p>It may be time to review your previous purchase, based on RIWAY-approved product timing.</p><p><a href="${escaped(link)}">Review your previous order</a></p><p>This does not place an order, start a subscription or authorize payment. Review current prices and availability at checkout.</p><p><a href="${escaped(unsubscribe)}">Stop reorder emails</a></p>${statements.map((s) => `<p>${escaped(s)}</p>`).join("")}`,
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" as const,
      },
    };
  }
  if (
    notification.type === "consultation_update" ||
    notification.type === "consultation_reminder"
  ) {
    const c = z
      .object({
        bookingId: z.uuid(),
        revision: z.number().int().nonnegative(),
        status: z.enum(["booked", "cancelled"]),
        startsAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
        timezone: z.string().max(80),
      })
      .parse(notification.context);
    const date = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: c.timezone,
    }).format(new Date(c.startsAt));
    const subject =
      notification.type === "consultation_reminder"
        ? "RIWAY consultation reminder"
        : `RIWAY consultation ${c.status}`;
    const link = new URL("/account/consultations", siteOrigin()).href;
    const text = `${subject}\n${date} (${c.timezone})\nSign in to view, reschedule or cancel your consultation: ${link}\nBooking reference: ${c.bookingId}`;
    return {
      subject,
      text,
      html: `<h1>${escaped(subject)}</h1><p>${escaped(date)} (${escaped(c.timezone)})</p><p><a href="${escaped(link)}">Manage your consultation</a></p><p>Booking reference: ${escaped(c.bookingId)}</p>`,
    };
  }
  if (notification.type === "order_confirmed") {
    const o = orderConfirmedContext.parse(notification.context);
    if (o.orderId !== notification.reference)
      throw new Error("Order confirmation reference mismatch");
    const link = new URL(`/account/orders/${o.orderId}`, siteOrigin()).href;
    const money = (minor: number) => minorAmount(minor, o.currency);
    const number = o.orderId.slice(0, 8).toUpperCase();
    const lines = o.items.map(
      (i) => `${i.name} × ${i.quantity} | ${money(i.netMinor)}`,
    );
    const statements = [
      "This email confirms your payment. It is not a tax invoice or official receipt.",
      ...orderStatements[o.market],
    ];
    const totals = `Subtotal ${money(o.subtotalMinor)}${o.discountMinor ? ` · Discount −${money(o.discountMinor)}` : ""} · Total paid ${money(o.totalMinor)}`;
    return {
      subject: `RIWAY order ${number} confirmed`,
      text: [
        `Thank you. Payment for your RIWAY order ${number} (placed ${o.placedAt}, ${o.market}) has been confirmed.`,
        "",
        ...lines,
        ...(o.bonusItems ?? []).map(
          (b) =>
            `Bonus: ${b.name} × ${b.quantity} | No additional charge\n${b.returnTerms}`,
        ),
        totals,
        "",
        `We will email you when it is dispatched or ready for collection. Order details and delivery progress: ${link}`,
        "",
        ...statements,
      ].join("\n"),
      html: `<h1>Order ${number} confirmed</h1><p>Payment for your RIWAY order placed ${o.placedAt} (${o.market}) has been confirmed.</p><table><thead><tr><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${escaped(i.name)}</td><td>${i.quantity}</td><td>${escaped(money(i.netMinor))}</td></tr>`).join("")}</tbody></table>${(o.bonusItems ?? []).map((b) => `<p>Bonus: ${escaped(b.name)} × ${b.quantity} · No additional charge</p><p>${escaped(b.returnTerms)}</p>`).join("")}<p>${escaped(totals)}</p><p>We will email you when it is dispatched or ready for collection.</p><p><a href="${escaped(link)}">View your order</a></p>${statements.map((s) => `<p><small>${escaped(s)}</small></p>`).join("")}`,
    };
  }
  if (notification.type === "corporate_low_stock") {
    const r = corporateLowStockContext.parse(notification.context);
    const link = new URL("/admin/inventory", siteOrigin()).href;
    const lines = r.items.map(
      (i) =>
        `${i.product} | available: ${i.available} | threshold: ${i.threshold}`,
    );
    return {
      subject: `RIWAY low-stock alert · ${r.market} · ${r.day}`,
      text: [
        `${r.lowStockCount} checkout stock record${r.lowStockCount === 1 ? " is" : "s are"} at or below threshold in ${r.market} on ${r.day}.`,
        "",
        ...lines,
        "",
        `Manage inventory (sign-in and authenticator required): ${link}`,
      ].join("\n"),
      html: `<h1>Low-stock alert · ${r.market}</h1><p>${r.day} · ${r.lowStockCount} checkout stock record(s) at or below threshold. Up to 100 are listed.</p><table><thead><tr><th>Product</th><th>Available</th><th>Threshold</th></tr></thead><tbody>${r.items.map((i) => `<tr><td>${escaped(i.product)}</td><td>${i.available}</td><td>${i.threshold}</td></tr>`).join("")}</tbody></table><p><a href="${escaped(link)}">Manage inventory</a> (sign-in and authenticator required)</p>`,
    };
  }
  if (notification.type === "sales_report") {
    const r = salesReportContext.parse(notification.context);
    const origin = new URL(siteOrigin());
    const link = new URL(
      `/admin/reports?${new URLSearchParams({ from: r.from, to: r.to })}`,
      origin.origin,
    ).href;
    const label = r.frequency === "weekly" ? "Weekly" : "Monthly";
    const money = (minor: number) => minorAmount(minor, r.currency);
    const summary = `${r.orders} settled order${r.orders === 1 ? "" : "s"} · total ${money(r.totalMinor)} (subtotal ${money(r.subtotalMinor)}, discounts ${money(r.discountMinor)})`;
    const lines = r.topProducts.map(
      (p) => `${p.name} | ${p.units} units | ${money(p.netMinor)}`,
    );
    return {
      subject: `RIWAY ${label.toLowerCase()} sales report · ${r.market} · ${r.from} to ${r.to}`,
      text: `${label} sales report for ${r.market}, ${r.from} to ${r.to} (UTC order dates, settled orders only).\n${summary}\n\n${lines.length ? `Top products:\n${lines.join("\n")}` : "No product sales in this period."}\n\nFull report, channel breakdown and CSV (sign-in and authenticator required): ${link}`,
      html: `<h1>${label} sales report · ${r.market}</h1><p>${r.from} to ${r.to} · UTC order dates · settled orders only</p><p>${escaped(summary)}</p>${
        lines.length
          ? `<table><thead><tr><th>Product</th><th>Units</th><th>Net sales</th></tr></thead><tbody>${r.topProducts.map((p) => `<tr><td>${escaped(p.name)}</td><td>${p.units}</td><td>${escaped(money(p.netMinor))}</td></tr>`).join("")}</tbody></table>`
          : "<p>No product sales in this period.</p>"
      }<p><a href="${escaped(link)}">Open the full report</a> (sign-in and authenticator required)</p>`,
    };
  }
  if (
    notification.type === "order_shipped" ||
    notification.type === "order_delivered"
  ) {
    const origin = new URL(siteOrigin());
    // Tracking details stay in the signed-in account rather than in email.
    const link = new URL("/account/orders", origin.origin).href;
    const shipped = notification.type === "order_shipped";
    const subject = shipped
      ? "Your RIWAY order is on its way"
      : "Your RIWAY order has been delivered";
    const body = shipped
      ? "Your order has been dispatched. Sign in to your account to see the carrier, tracking details or collection information."
      : "Your order has been marked as delivered. If anything is missing or damaged, contact RIWAY support from your account.";
    return {
      subject,
      text: `${body}\n\nYour orders: ${link}`,
      html: `<p>${escaped(body)}</p><p><a href="${escaped(link)}">View your orders</a></p>`,
    };
  }
  if (
    notification.type === "membership_requested" ||
    notification.type === "membership_confirmed"
  ) {
    const origin = new URL(siteOrigin());
    const link = new URL("/account/membership", origin.origin).href;
    const confirmed = notification.type === "membership_confirmed";
    const subject = confirmed
      ? "Your RIWAY membership is confirmed"
      : "Your RIWAY membership application was received";
    const body = confirmed
      ? "Welcome. Your qualifying purchase has been linked to a verified RIWAY member record. Visit your account to review your membership and package history."
      : "Your qualifying payment was recorded. Your membership application awaits confirmation against RIWAY's records. It does not yet activate member pricing.";
    return {
      subject,
      text: `${body}\n\nYour membership: ${link}`,
      html: `<p>${escaped(body)}</p><p><a href="${escaped(link)}">View your membership</a></p>`,
    };
  }
  if (
    notification.type === "store_owner_onboarding" ||
    notification.type === "low_inventory_report"
  ) {
    const tenant = z.uuid().parse(notification.tenantId);
    const store = z.string().min(2).max(120).parse(notification.context.store);
    const origin = new URL(siteOrigin());
    const link = new URL(`/operations?store=${tenant}`, origin.origin).href;
    if (notification.type === "store_owner_onboarding") {
      const text = `You have been assigned as a store owner for ${store}. Sign in with your existing RIWAY account, enable your authenticator, then add locations, SKUs and stock.\n\nManage your store: ${link}`;
      return {
        subject: "Welcome to RIWAY store management",
        text,
        html: `<h1>Welcome to RIWAY</h1><p>You are a store owner for <strong>${escaped(store)}</strong>.</p><p>Sign in with your existing account and enable your authenticator. You can then add locations, SKUs and stock.</p><p><a href="${escaped(link)}">Manage your store</a></p>`,
      };
    }
    const report = z
      .object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lowStockCount: z.number().int().positive(),
        items: z
          .array(
            z.object({
              sku: z.string().max(64),
              location: z.string().max(100),
              available: z.number().int().nonnegative(),
              threshold: z.number().int().nonnegative(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(notification.context);
    const text = `${store} — low inventory report for ${report.day}\n${report.lowStockCount} SKU/location records are at or below their threshold.\n\n${report.items.map((item) => `${item.sku} | ${item.location} | available: ${item.available} | threshold: ${item.threshold}`).join("\n")}\n\nReview inventory: ${link}`;
    return {
      subject: "RIWAY daily low inventory report",
      text,
      html: `<h1>Low inventory report</h1><p>${escaped(store)} · ${report.day}</p><p>${report.lowStockCount} SKU/location records need attention. Up to 100 are listed below.</p><table><thead><tr><th>SKU</th><th>Location</th><th>Available</th><th>Threshold</th></tr></thead><tbody>${report.items.map((item) => `<tr><td>${escaped(item.sku)}</td><td>${escaped(item.location)}</td><td>${item.available}</td><td>${item.threshold}</td></tr>`).join("")}</tbody></table><p><a href="${escaped(link)}">Review your inventory</a></p>`,
    };
  }
  const text = {
    support_received:
      "Your support request has been recorded. Our team will review it.",
    event_registered:
      "Your event registration has been recorded. Visit your RIWAY account for details.",
    inventory_alert:
      "An inventory record needs attention. Sign in to RIWAY store management to review it.",
  }[notification.type];
  const subject = {
    support_received: "RIWAY support request received",
    event_registered: "RIWAY event registration",
    inventory_alert: "RIWAY inventory alert",
  }[notification.type];
  return { subject, text, html: `<p>${text}</p>` };
}
