import { z } from "zod";

// Mirrors private.my_report_subscriptions / set_report_subscription.
export const reportFrequencies = ["weekly", "monthly"] as const;

export const reportSubscriptionsSchema = z
  .array(
    z.object({
      market: z.enum(["PH", "SG", "MY"]),
      frequency: z.enum(reportFrequencies).nullable(),
    }),
  )
  .min(1)
  .max(3);
export type ReportSubscriptions = z.infer<typeof reportSubscriptionsSchema>;

export const reportSubscriptionRequestSchema = z.object({
  market: z.enum(["PH", "SG", "MY"]),
  frequency: z
    .enum(["off", ...reportFrequencies])
    .transform((v) => (v === "off" ? null : v)),
});

export const frequencyLabels = {
  weekly: "Weekly (Mondays, previous Monday–Sunday)",
  monthly: "Monthly (1st, previous calendar month)",
} as const;
