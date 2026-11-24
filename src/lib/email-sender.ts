import { z } from "zod";

// Resend supports a bare mailbox or a friendly name followed by one mailbox.
// Reject control characters before trimming, so header injection cannot hide
// in otherwise valid configuration.
export const emailSenderSchema = z
  .string()
  .max(400)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
  .transform((value) => value.trim())
  .refine((value) => {
    if (z.email().safeParse(value).success) return true;
    const named = value.match(/^([^<>]+)\s<([^<>]+)>$/);
    return !!named?.[1].trim() && z.email().safeParse(named?.[2]).success;
  }, "Configure a valid sender email address.");
