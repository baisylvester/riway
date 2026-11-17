import { z } from "zod";
import { membershipQualificationSchema } from "./membership";

// Demonstration data stays in browser memory. These identifiers are never
// submitted to an order, membership, payment or administrator endpoint.
const documents = {
  termsVersion: "sample-terms-v1",
  termsText:
    "SAMPLE ONLY. This is a demonstration of purchase qualification and recorded consent. It is not RIWAY's approved membership agreement, creates no real member and authorises no payment.",
  codeVersion: "sample-conduct-v1",
  codeText:
    "SAMPLE ONLY. Treat other people respectfully, use only approved product information and do not make income guarantees. This demonstration does not replace RIWAY's approved Code of Conduct.",
};
export const sampleMembershipPackages = [
  {
    key: "sample-starter",
    qualification: membershipQualificationSchema.parse({
      ...documents,
      ruleId: "91000000-0000-4000-8000-000000000001",
      packageOfferId: "91000000-0000-4000-8000-000000000002",
      productId: "91000000-0000-4000-8000-000000000003",
      packageName: "Sample Starter Package",
      tierCode: "SAMPLE_STARTER",
      tierName: "Sample Starter",
      minimumQuantity: 1,
    }),
  },
  {
    key: "sample-plus",
    qualification: membershipQualificationSchema.parse({
      ...documents,
      ruleId: "91000000-0000-4000-8000-000000000004",
      packageOfferId: "91000000-0000-4000-8000-000000000005",
      productId: "91000000-0000-4000-8000-000000000006",
      packageName: "Sample Plus Package",
      tierCode: "SAMPLE_PLUS",
      tierName: "Sample Plus",
      minimumQuantity: 2,
    }),
  },
] as const;

export function sampleMembershipQualification(key: string, quantity: number) {
  const selected = sampleMembershipPackages.find((item) => item.key === key);
  if (
    !selected ||
    !z.number().int().min(1).max(24).safeParse(quantity).success ||
    quantity < selected.qualification.minimumQuantity
  )
    return null;
  return selected.qualification;
}

export type SampleMembershipStage =
  "pending_payment" | "pending_verification" | "confirmed" | "cancelled";
export function advanceSampleMembership(
  current: SampleMembershipStage,
  action: "pay" | "confirm" | "cancel",
): SampleMembershipStage {
  if (current === "pending_payment" && action === "pay")
    return "pending_verification";
  if (current === "pending_verification" && action === "confirm")
    return "confirmed";
  if (current === "pending_payment" && action === "cancel") return "cancelled";
  throw new Error("This sample action is unavailable at the current step.");
}
