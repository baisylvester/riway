import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// This cookie is an untrusted pending introduction, never an identity or a
// sponsor authorization. Every use is checked against the public lookup RPC.
export const pendingReferralCookie = "riway-pending-referral";
export const referralLifetimeSeconds = 30 * 24 * 60 * 60;
export const validReferralCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9-]{3,40}$/.test(value);

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

export async function clearPendingReferral() {
  (await cookies()).set(pendingReferralCookie, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}

async function verifiedDistributor(client: SupabaseClient, code: string) {
  const { data, error } = await client.rpc("lookup_distributor", { c: code });
  if (error) throw new Error("Referral lookup unavailable");
  if (!Array.isArray(data)) throw new Error("Unexpected referral lookup");
  return data.find(
    (item: { code?: unknown; display_name?: unknown }) =>
      item.code === code && typeof item.display_name === "string",
  ) as { code: string; display_name: string } | undefined;
}

export async function rememberReferral(client: SupabaseClient, code: string) {
  if (!validReferralCode(code)) return null;
  const jar = await cookies();
  const pending = jar.get(pendingReferralCookie)?.value;
  if (validReferralCode(pending)) {
    const existing = await verifiedDistributor(client, pending);
    if (existing)
      return {
        state: "saved" as const,
        message: `Your first saved introduction from ${existing.display_name} is retained. Sign in to link it; an existing sponsor cannot be replaced.`,
      };
  }
  // Malformed/revoked pending data cannot block a new valid introduction.
  // A still-valid first introduction above never gets its lifetime refreshed.
  if (pending !== undefined) await clearPendingReferral();
  const distributor = await verifiedDistributor(client, code);
  if (!distributor) return null;
  jar.set(pendingReferralCookie, distributor.code, {
    ...cookieOptions(),
    maxAge: referralLifetimeSeconds,
  });
  return {
    state: "saved" as const,
    message: `Your introduction from ${distributor.display_name} is saved for up to 30 days. Sign in to link it; an existing sponsor cannot be replaced.`,
  };
}

export async function completePendingReferral(client: SupabaseClient) {
  const pending = (await cookies()).get(pendingReferralCookie)?.value;
  if (pending === undefined) return { state: "none" as const, message: "" };
  if (!validReferralCode(pending)) {
    await clearPendingReferral();
    return {
      state: "invalid" as const,
      message:
        "The saved introduction is invalid and has been cleared. Open a verified distributor introduction to try again.",
    };
  }
  if (!(await verifiedDistributor(client, pending))) {
    await clearPendingReferral();
    return {
      state: "invalid" as const,
      message:
        "The saved distributor introduction is no longer available and has been cleared. Your existing sponsor remains unchanged.",
    };
  }
  const { data, error } = await client.rpc("claim_referral", { c: pending });
  if (error?.message === "Invalid referring distributor") {
    await clearPendingReferral();
    return {
      state: "invalid" as const,
      message:
        "This introduction cannot be linked to your account and has been cleared. Your existing sponsor remains unchanged.",
    };
  }
  // Transient failures and rate limits keep the cookie for an explicit retry.
  if (error || typeof data !== "string")
    throw new Error("Referral linking unavailable");
  await clearPendingReferral();
  return { state: "linked" as const, message: data };
}
