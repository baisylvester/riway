import { z } from "zod";

export const membershipConsentSchema = z
  .object({
    ruleId: z.uuid(),
    termsVersion: z.string().trim().min(3).max(100),
    codeVersion: z.string().trim().min(3).max(100),
    accepted: z.literal(true),
  })
  .strict();
export type MembershipConsent = z.infer<typeof membershipConsentSchema>;
