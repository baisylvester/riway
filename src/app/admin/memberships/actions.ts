"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import {
  membershipApprovalSchema,
  membershipConfirmationSchema,
  membershipEnrollmentSchema,
  membershipRuleSchema,
  membershipWithdrawalSchema,
} from "@/lib/membership";

export type MembershipActionResult = { message: string; ok?: boolean };

function problem(code: string) {
  if (code === "42501")
    return "Market administrator or compliance access with verified MFA is required.";
  if (["PGRST202", "42883", "42P01"].includes(code))
    return "Membership setup is pending. Please contact your administrator.";
  if (code === "23505")
    return "This package already has an active rule or the RIWAY member record is already linked. Reload before trying again.";
  if (code === "40001")
    return "This record changed. Reload and review the latest details before trying again.";
  return "The request was rejected. Check the package, enrolment status, reference and market permissions.";
}

function refresh() {
  for (const route of [
    "/admin/memberships",
    "/account",
    "/account/membership",
    "/membership",
    "/checkout",
    "/cart",
  ])
    revalidatePath(route);
}

async function writer() {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return null;
  const current = await session();
  if (!current.user || current.user.id !== access.user.id) return null;
  return current;
}

export async function approveMembershipRule(
  _: MembershipActionResult,
  form: FormData,
): Promise<MembershipActionResult> {
  try {
    const current = await writer();
    if (!current)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = membershipApprovalSchema.safeParse({
      packageOfferId: form.get("packageOfferId"),
      tierCode: form.get("tierCode"),
      tierName: form.get("tierName"),
      minimumQuantity: Number(form.get("minimumQuantity")),
      termsVersion: form.get("termsVersion"),
      termsText: form.get("termsText"),
      codeVersion: form.get("codeVersion"),
      codeText: form.get("codeText"),
      approvalReference: form.get("approvalReference"),
    });
    if (!parsed.success || form.get("acknowledged") !== "on")
      return {
        message:
          "Select an approved package, complete its tier and consent documents, enter an approval reference and confirm your authority.",
      };
    const input = parsed.data;
    const { data, error } = await current.client.rpc(
      "approve_membership_rule",
      {
        p_package_offer: input.packageOfferId,
        p_tier_code: input.tierCode,
        p_tier_name: input.tierName,
        p_minimum_quantity: input.minimumQuantity,
        p_terms_version: input.termsVersion,
        p_terms_text: input.termsText,
        p_code_version: input.codeVersion,
        p_code_text: input.codeText,
        p_reference: input.approvalReference,
      },
    );
    if (error) return { message: problem(error.code) };
    const rule = membershipRuleSchema.safeParse(data);
    if (
      !rule.success ||
      rule.data.packageOfferId !== input.packageOfferId ||
      rule.data.tierCode !== input.tierCode ||
      rule.data.tierName !== input.tierName ||
      rule.data.minimumQuantity !== input.minimumQuantity ||
      rule.data.termsVersion !== input.termsVersion ||
      rule.data.termsText !== input.termsText ||
      rule.data.codeVersion !== input.codeVersion ||
      rule.data.codeText !== input.codeText ||
      rule.data.approvalReference !== input.approvalReference ||
      rule.data.withdrawnAt !== null
    )
      return {
        message:
          "The approval response could not be verified. Reload before trying again.",
      };
    refresh();
    return {
      ok: true,
      message:
        "Membership rule approved. Sales and payment approvals remain separate; a qualifying paid purchase still requires RIWAY membership verification.",
    };
  } catch {
    return {
      message: "Membership approval could not be reached. Please retry.",
    };
  }
}

export async function withdrawMembershipRule(
  _: MembershipActionResult,
  form: FormData,
): Promise<MembershipActionResult> {
  try {
    const current = await writer();
    if (!current)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = membershipWithdrawalSchema.safeParse({
      ruleId: form.get("ruleId"),
      reference: form.get("reference"),
    });
    if (!parsed.success || form.get("acknowledged") !== "on")
      return {
        message: "Enter a withdrawal reference and confirm the withdrawal.",
      };
    const input = parsed.data;
    const { data, error } = await current.client.rpc(
      "withdraw_membership_rule",
      {
        p_rule: input.ruleId,
        p_reference: input.reference,
      },
    );
    if (error) return { message: problem(error.code) };
    const rule = membershipRuleSchema.safeParse(data);
    if (
      !rule.success ||
      rule.data.id !== input.ruleId ||
      !rule.data.withdrawnAt
    )
      return {
        message:
          "The withdrawal response could not be verified. Reload before trying again.",
      };
    refresh();
    return {
      ok: true,
      message:
        "Rule withdrawn from new purchases. Existing orders retain their recorded qualification and consent.",
    };
  } catch {
    return { message: "The withdrawal could not be reached. Please retry." };
  }
}

export async function confirmMembershipEnrollment(
  _: MembershipActionResult,
  form: FormData,
): Promise<MembershipActionResult> {
  try {
    const current = await writer();
    if (!current)
      return {
        message: "Staff access and authenticator verification are required.",
      };
    const parsed = membershipConfirmationSchema.safeParse({
      enrollmentId: form.get("enrollmentId"),
      externalMemberId: form.get("externalMemberId"),
      reference: form.get("reference"),
      verified: form.get("verified") === "on",
    });
    if (!parsed.success)
      return {
        message:
          "Enter the existing RIWAY member ID and verification reference, and confirm that you checked the RIWAY record.",
      };
    const input = parsed.data;
    const { data, error } = await current.client.rpc(
      "confirm_membership_enrollment",
      {
        p_enrollment: input.enrollmentId,
        p_external_member_id: input.externalMemberId,
        p_reference: input.reference,
      },
    );
    if (error) return { message: problem(error.code) };
    const enrollment = membershipEnrollmentSchema.safeParse(data);
    if (
      !enrollment.success ||
      enrollment.data.id !== input.enrollmentId ||
      enrollment.data.status !== "confirmed" ||
      enrollment.data.externalMemberId !== input.externalMemberId ||
      !enrollment.data.confirmedAt
    )
      return {
        message:
          "The verification response could not be confirmed. Reload before trying again.",
      };
    refresh();
    return {
      ok: true,
      message:
        "Existing RIWAY membership confirmed and linked to the qualifying purchase. No distributor or staff role was granted.",
    };
  } catch {
    return {
      message: "Membership verification could not be reached. Please retry.",
    };
  }
}
