import "server-only";
import { Resend } from "resend";
import { z } from "zod";
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
  return new ResendTransactionalEmailProvider(
    new Resend(process.env.RESEND_API_KEY),
    process.env.RESEND_FROM_EMAIL,
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

export function notificationContent(notification: Notification) {
  if (
    notification.type === "store_owner_onboarding" ||
    notification.type === "low_inventory_report"
  ) {
    const tenant = z.uuid().parse(notification.tenantId);
    const store = z.string().min(2).max(120).parse(notification.context.store);
    const origin = new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:4173",
    );
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password
    )
      throw new Error("Invalid notification site URL");
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
