type CompensationEnvironment = {
  COMPENSATION_PROVIDER?: string;
  COMPENSATION_WORKER_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  WORKER_SELF_REFERENCE?: { fetch(request: Request): Promise<Response> };
};

// Runs only once RIWAY compensation delivery has been explicitly enabled.
export async function runCompensationSchedule(env: CompensationEnvironment) {
  if (!env.COMPENSATION_PROVIDER || env.COMPENSATION_PROVIDER === "disabled")
    return;
  if (
    !env.COMPENSATION_WORKER_SECRET ||
    env.COMPENSATION_WORKER_SECRET.length < 32 ||
    !env.NEXT_PUBLIC_SITE_URL ||
    !env.WORKER_SELF_REFERENCE
  )
    throw new Error("Compensation schedule configuration is incomplete.");
  const target = new URL(
    "/api/internal/compensation",
    env.NEXT_PUBLIC_SITE_URL,
  );
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("Invalid compensation worker target.");
  const response = await env.WORKER_SELF_REFERENCE.fetch(
    new Request(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.COMPENSATION_WORKER_SECRET}` },
    }),
  );
  if (!response.ok)
    throw new Error(`Compensation delivery returned HTTP ${response.status}.`);
  await response.body?.cancel();
}
