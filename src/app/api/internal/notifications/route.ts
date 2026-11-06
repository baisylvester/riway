import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/nextjs/server";
import {
  EmailDeliveryError,
  emailProvider,
  notificationContent,
  type Notification,
  reportDate,
} from "@/services/resend-email";
import { failure } from "@/lib/http";
import { notificationConfiguration } from "@/lib/notification-config";
export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_WORKER_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !secret ||
    secret.length < 32 ||
    !url ||
    !key ||
    process.env.EMAIL_PROVIDER !== "resend"
  )
    return failure("Notification worker is not configured.", 503);
  const received = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return failure("Unauthorized", 401);
  // Reject incomplete setup before claiming jobs or consuming their retry budget.
  if (notificationConfiguration(process.env).issues.length)
    return failure("Notification delivery configuration is incomplete.", 503);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let provider;
  try {
    provider = emailProvider();
  } catch {
    return failure("Email delivery is not configured.", 503);
  }
  const hour = Number(process.env.LOW_INVENTORY_REPORT_HOUR || 9);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    return failure("Invalid inventory report schedule.", 503);
  let day;
  try {
    day = reportDate(
      new Date(),
      process.env.LOW_INVENTORY_REPORT_TIMEZONE || "Asia/Shanghai",
      hour,
    );
  } catch {
    return failure("Invalid inventory report timezone.", 503);
  }
  if (day) {
    const reports = await client.rpc("queue_low_inventory_reports", {
      report_day: day,
    });
    if (reports.error)
      return failure("Inventory report queue is unavailable.", 503);
  }
  const { data: jobs, error } = await client.rpc("claim_notifications");
  if (error || !Array.isArray(jobs))
    return failure("Notification queue is unavailable.", 503);
  let sent = 0,
    failed = 0;
  for (const job of jobs) {
    let outcome = "retry",
      reference: string | null = null;
    try {
      const authorized = await client.rpc("notification_authorized", {
        job: job.id,
        token: job.lease,
      });
      if (authorized.error)
        throw new Error("Notification authorization unavailable");
      if (authorized.data !== true) {
        const result = await client.rpc("finish_notification", {
          job: job.id,
          token: job.lease,
          result: "suppressed",
          reference: null,
        });
        if (result.error || result.data !== true) failed++;
        continue;
      }
      let to = job.recipient as string | null;
      if (!to) {
        const contact = await client.rpc("notification_contact", {
          u: job.user_id,
        });
        if (contact.error) throw new Error("Contact lookup failed");
        if (
          process.env.AUTH_PROVIDER === "clerk" &&
          contact.data?.clerk_issuer === process.env.CLERK_ISSUER_URL &&
          contact.data?.clerk_subject
        ) {
          const account = await (
            await clerkClient()
          ).users.getUser(contact.data.clerk_subject);
          const primary = account.emailAddresses.find(
            (e) =>
              e.id === account.primaryEmailAddressId &&
              e.verification?.status === "verified",
          );
          to = primary?.emailAddress || null;
        } else if (process.env.AUTH_PROVIDER !== "clerk")
          to = contact.data?.native_email || null;
        if (to) {
          const saved = await client.rpc("prepare_notification", {
            job: job.id,
            token: job.lease,
            destination: to,
          });
          if (saved.error || !saved.data)
            throw new Error("Recipient persistence failed");
          to = saved.data;
        }
      }
      if (!to) outcome = "suppressed";
      else {
        const content = notificationContent({
          type: job.kind,
          reference: job.reference,
          tenantId: job.tenant_id,
          context: job.context,
        } as Notification);
        const result = await provider.send({
          to: [to],
          idempotencyKey: `notification/${job.id}`,
          ...content,
          replyTo: process.env.RESEND_REPLY_TO || undefined,
        });
        outcome = "sent";
        reference = result.providerMessageId;
      }
    } catch (error) {
      outcome =
        error instanceof EmailDeliveryError && !error.retryable
          ? "failed"
          : "retry";
    }
    const result = await client.rpc("finish_notification", {
      job: job.id,
      token: job.lease,
      result: outcome,
      reference,
    });
    if (result.error || result.data !== true) failed++;
    else if (outcome === "sent") sent++;
  }
  return Response.json(
    { processed: jobs.length, sent, persistenceFailures: failed },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
