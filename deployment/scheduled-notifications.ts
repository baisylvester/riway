type NotificationEnvironment = {
  EMAIL_PROVIDER?: string;
  NOTIFICATION_WORKER_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

export async function runNotificationSchedule(env: NotificationEnvironment) {
  if (env.EMAIL_PROVIDER !== "resend") return;
  if (
    !env.NOTIFICATION_WORKER_SECRET ||
    env.NOTIFICATION_WORKER_SECRET.length < 32 ||
    !env.WORKER_SELF_REFERENCE ||
    !env.NEXT_PUBLIC_SITE_URL
  )
    throw new Error("Notification schedule configuration is incomplete.");
  const target = new URL(
    "/api/internal/notifications",
    env.NEXT_PUBLIC_SITE_URL,
  );
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("Invalid scheduled notification target.");
  const response = await env.WORKER_SELF_REFERENCE.fetch(
    new Request(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.NOTIFICATION_WORKER_SECRET}` },
    }),
  );
  if (!response.ok)
    throw new Error(
      `Notification processing returned HTTP ${response.status}.`,
    );
  await response.body?.cancel();
}
