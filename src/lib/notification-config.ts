import { z } from "zod";

// Only safe labels and schedule details leave this helper; secret values never do.
export function notificationConfiguration(
  env: Record<string, string | undefined>,
) {
  const enabled = env.EMAIL_PROVIDER === "resend";
  const mode = env.EMAIL_DELIVERY_MODE || "test";
  const timezone = env.LOW_INVENTORY_REPORT_TIMEZONE || "Asia/Shanghai";
  const hour = Number(env.LOW_INVENTORY_REPORT_HOUR || 9);
  const recipients = (env.EMAIL_TEST_RECIPIENTS || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const issues: string[] = [];
  if (
    env.EMAIL_PROVIDER &&
    !["disabled", "resend"].includes(env.EMAIL_PROVIDER)
  )
    issues.push("Choose a supported email provider.");
  if (!env.RESEND_API_KEY) issues.push("Configure a Resend sending key.");
  if (!z.email().safeParse(env.RESEND_FROM_EMAIL).success)
    issues.push("Configure a valid sender email address.");
  if (env.RESEND_REPLY_TO && !z.email().safeParse(env.RESEND_REPLY_TO).success)
    issues.push("Configure a valid reply-to email address.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    issues.push("Configure the notification worker's server database key.");
  if (
    !env.NOTIFICATION_WORKER_SECRET ||
    env.NOTIFICATION_WORKER_SECRET.length < 32
  )
    issues.push(
      "Configure a notification worker secret of at least 32 characters.",
    );
  if (!["test", "live"].includes(mode))
    issues.push("Choose test or live email delivery.");
  if (mode === "live" && env.NODE_ENV !== "production")
    issues.push("Live email requires a production runtime.");
  if (
    mode === "test" &&
    (!recipients.length ||
      recipients.some((email) => !z.email().safeParse(email).success))
  )
    issues.push("Configure valid allowlisted test recipients.");
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL || "");
    const local =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      env.NODE_ENV !== "production";
    if ((url.protocol !== "https:" && !local) || url.username || url.password)
      throw new Error();
  } catch {
    issues.push("Configure a valid HTTPS website URL.");
  }
  let schedule: string | null = null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error();
    schedule = `${String(hour).padStart(2, "0")}:00 ${timezone}`;
  } catch {
    issues.push("Configure a valid report timezone and an hour from 0 to 23.");
  }
  return {
    status: !enabled
      ? "disabled"
      : issues.length
        ? "incomplete"
        : mode === "live"
          ? "live"
          : "test",
    schedule,
    issues,
  } as const;
}
