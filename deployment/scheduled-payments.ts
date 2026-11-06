type PaymentEnvironment = {
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  PAYMENT_WORKER_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};
export async function runPaymentSchedule(env: PaymentEnvironment) {
  if (env.PAYMENT_PROVIDER !== "stripe" && !env.STRIPE_SECRET_KEY) return;
  if (
    !env.PAYMENT_WORKER_SECRET ||
    env.PAYMENT_WORKER_SECRET.length < 32 ||
    !env.NEXT_PUBLIC_SITE_URL ||
    !env.WORKER_SELF_REFERENCE
  )
    throw new Error("Payment schedule configuration is incomplete.");
  const target = new URL("/api/internal/payments", env.NEXT_PUBLIC_SITE_URL);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("Invalid payment worker target.");
  const response = await env.WORKER_SELF_REFERENCE.fetch(
    new Request(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PAYMENT_WORKER_SECRET}` },
    }),
  );
  if (!response.ok)
    throw new Error(`Payment reconciliation returned HTTP ${response.status}.`);
  await response.body?.cancel();
}
