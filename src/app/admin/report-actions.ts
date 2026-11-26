"use server";

import { revalidatePath } from "@/lib/revalidation";
import { session, staffAccess } from "@/lib/data";
import {
  reportSubscriptionRequestSchema,
  reportSubscriptionsSchema,
} from "@/lib/report-subscriptions";

export type SubscriptionResult = { message: string; ok?: boolean };

// Staff subscribe themselves; the database checks market role and MFA again.
export async function saveReportSubscription(
  _: SubscriptionResult,
  form: FormData,
): Promise<SubscriptionResult> {
  try {
    const access = await staffAccess();
    if (!access.user || !access.allowed || !access.mfa)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = reportSubscriptionRequestSchema.safeParse({
      market: form.get("market"),
      frequency: form.get("frequency"),
    });
    if (!parsed.success) return { message: "Choose a market and schedule." };
    const { client } = await session();
    const { data, error } = await client.rpc("set_report_subscription", {
      p_market: parsed.data.market,
      p_frequency: parsed.data.frequency,
    });
    if (error)
      return {
        message:
          error.code === "42501"
            ? "Market administrator or operations access with verified MFA is required."
            : ["PGRST202", "42883", "42P01"].includes(error.code ?? "")
              ? "Scheduled reports are not available yet."
              : "The schedule could not be saved. Reload and try again.",
      };
    const result = reportSubscriptionsSchema.safeParse(data);
    const saved = result.success
      ? result.data.find((s) => s.market === parsed.data.market)
      : undefined;
    if (!saved || saved.frequency !== parsed.data.frequency)
      return {
        message: "The schedule could not be confirmed. Reload the page.",
      };
    revalidatePath("/admin/reports");
    return {
      ok: true,
      message: parsed.data.frequency
        ? `${parsed.data.market} ${parsed.data.frequency} report scheduled.`
        : `${parsed.data.market} scheduled report turned off.`,
    };
  } catch {
    return { message: "Scheduled reports could not be reached. Please retry." };
  }
}
