type RefundEnvironment = {
  REFUNDS_ENABLED?: string;
  REFUND_WORKER_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

export async function runRefundSchedule(env: RefundEnvironment) {
  if (env.REFUNDS_ENABLED !== "true") return;
  if (
    !env.REFUND_WORKER_SECRET ||
    env.REFUND_WORKER_SECRET.length < 32 ||
    !env.NEXT_PUBLIC_SITE_URL ||
    !env.WORKER_SELF_REFERENCE
  )
    throw new Error("Refund schedule configuration is incomplete.");
  const target = new URL("/api/internal/refunds", env.NEXT_PUBLIC_SITE_URL);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("Invalid refund worker target.");
  const response = await env.WORKER_SELF_REFERENCE.fetch(
    new Request(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.REFUND_WORKER_SECRET}` },
    }),
  );
  if (!response.ok)
    throw new Error(`Refund reconciliation returned HTTP ${response.status}.`);
  await response.body?.cancel();
}
