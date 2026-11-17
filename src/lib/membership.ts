import { z } from "zod";
import { marketSchema } from "./domain";
export { membershipConsentSchema } from "./membership-consent";
export type { MembershipConsent } from "./membership-consent";

const version = z.string().trim().min(3).max(100);
const documentText = z.string().trim().min(20).max(12000);
const tierCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9_-]{2,40}$/);
const tierName = z.string().trim().min(2).max(80);
const timestamp = z.string().datetime({ offset: true });
const reference = z
  .string()
  .trim()
  .min(5)
  .max(200)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "Remove unsupported characters from the reference.",
  });

export const membershipQualificationSchema = z.object({
  ruleId: z.uuid(),
  packageOfferId: z.uuid(),
  productId: z.uuid(),
  packageName: z.string().min(1).max(120),
  tierCode,
  tierName,
  minimumQuantity: z.number().int().min(1).max(24),
  termsVersion: version,
  termsText: documentText,
  codeVersion: version,
  codeText: documentText,
});
export type MembershipQualification = z.infer<
  typeof membershipQualificationSchema
>;

export const membershipRuleSchema = z.object({
  id: z.uuid(),
  packageOfferId: z.uuid(),
  market: marketSchema,
  tierCode,
  tierName,
  minimumQuantity: z.number().int().min(1).max(24),
  termsVersion: version,
  termsText: documentText,
  codeVersion: version,
  codeText: documentText,
  approvalReference: reference,
  approvedAt: timestamp,
  withdrawnAt: timestamp.nullable(),
  approvedBy: z.uuid().optional(),
  productId: z.uuid().optional(),
  packageName: z.string().min(1).max(120).optional(),
});
export type MembershipRule = z.infer<typeof membershipRuleSchema>;

export const membershipEnrollmentSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  userId: z.uuid(),
  ruleId: z.uuid(),
  packageOfferId: z.uuid(),
  market: marketSchema,
  tierCode,
  tierName,
  status: z.enum([
    "pending_payment",
    "pending_verification",
    "confirmed",
    "not_applied",
    "cancelled",
    "rejected",
  ]),
  packageName: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(24),
  sponsorId: z.uuid(),
  // RIWAY's own member ID for the sponsor, as recorded when the order was placed.
  sponsorMemberId: z.string().min(1).max(128).nullable().optional(),
  createdAt: timestamp,
  paidAt: timestamp.nullable(),
  confirmedAt: timestamp.nullable(),
  consentedAt: timestamp,
  termsVersion: version,
  termsText: documentText,
  codeVersion: version,
  codeText: documentText,
  externalMemberId: z.string().min(1).max(128).nullable().optional(),
  confirmationReference: reference.nullable().optional(),
  rejectedAt: timestamp.nullable().optional(),
  rejectionReference: reference.nullable().optional(),
});
export type MembershipEnrollment = z.infer<typeof membershipEnrollmentSchema>;

export const staffMembershipsSchema = z.object({
  rules: z.array(membershipRuleSchema).max(50),
  enrollments: z.array(membershipEnrollmentSchema).max(50),
  markets: z.array(marketSchema).max(3),
  page: z.number().int().min(1).max(1000),
  hasMore: z.boolean(),
});
export const membershipStaffListSchema = staffMembershipsSchema;
export const myMembershipsSchema = z.object({
  membership: z
    .object({
      externalMemberId: z.string().min(1).max(128),
      tier: z.string().min(1).max(80),
      status: z.enum(["pending", "active", "suspended"]),
      syncedAt: timestamp,
    })
    .nullable(),
  enrollments: z.array(membershipEnrollmentSchema).max(50),
  page: z.number().int().min(1).max(1000),
  hasMore: z.boolean(),
});
export const membershipAccountSchema = myMembershipsSchema;

export const membershipApprovalSchema = z.object({
  packageOfferId: z.uuid(),
  tierCode,
  tierName,
  minimumQuantity: z.coerce.number().int().min(1).max(24),
  termsVersion: version,
  termsText: documentText,
  codeVersion: version,
  codeText: documentText,
  approvalReference: reference,
});
export const membershipWithdrawalSchema = z.object({
  ruleId: z.uuid(),
  reference,
});
export const membershipConfirmationSchema = z.object({
  enrollmentId: z.uuid(),
  // The database requires 2-128 characters; keep the form in step with it.
  externalMemberId: z.string().trim().min(2).max(128),
  reference,
  verified: z.literal(true),
});
export const membershipRejectionSchema = z.object({
  enrollmentId: z.uuid(),
  reference,
  acknowledged: z.literal(true),
});

export const membershipStatusLabels = {
  pending_payment: "Awaiting payment",
  pending_verification: "Awaiting RIWAY confirmation",
  confirmed: "Confirmed by RIWAY",
  not_applied: "Not applied - existing membership or request",
  cancelled: "Payment cancelled",
  rejected: "Not confirmed by RIWAY",
} as const;
