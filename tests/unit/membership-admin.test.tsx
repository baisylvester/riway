import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  requireSession: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({
  staffAccess: f.access,
  session: f.session,
  requireSession: f.requireSession,
}));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));

import {
  approveMembershipRule,
  confirmMembershipEnrollment,
  withdrawMembershipRule,
} from "../../src/app/admin/memberships/actions";
import MembershipAdministration from "../../src/app/admin/memberships/page";
import AccountMembership from "../../src/app/account/membership/page";
import {
  MembershipApprovalForm,
  MembershipConfirmationForm,
} from "../../src/components/membership-admin-forms";
import { MembershipDocuments } from "../../src/components/membership-admin-records";

const userId = "76000000-0000-4000-8000-000000000001";
const ruleId = "76000000-0000-4000-8000-000000000002";
const offerId = "76000000-0000-4000-8000-000000000003";
const productId = "76000000-0000-4000-8000-000000000004";
const enrollmentId = "76000000-0000-4000-8000-000000000005";
const orderId = "76000000-0000-4000-8000-000000000006";
const sponsorId = "76000000-0000-4000-8000-000000000007";
const otherUser = "76000000-0000-4000-8000-000000000008";
const draftId = "76000000-0000-4000-8000-000000000009";
const timestamp = "2026-11-16T08:30:00.123456+00:00";
const rule = () => ({
  id: ruleId,
  packageOfferId: offerId,
  market: "PH" as const,
  tierCode: "TEST_STARTER",
  tierName: "Fixture tier",
  minimumQuantity: 1,
  termsVersion: "test-terms-v1",
  termsText: "Fixture enrolment terms for validation only.",
  codeVersion: "test-code-v1",
  codeText: "Fixture code of conduct for validation only.",
  approvalReference: "TEST-APPROVAL",
  approvedAt: timestamp,
  withdrawnAt: null as string | null,
});
const enrollment = () => ({
  ...rule(),
  id: enrollmentId,
  orderId,
  userId,
  ruleId,
  packageOfferId: offerId,
  status: "pending_verification" as const,
  packageName: "Fixture package",
  quantity: 1,
  sponsorId,
  createdAt: timestamp,
  paidAt: timestamp,
  confirmedAt: null as string | null,
  consentedAt: timestamp,
  externalMemberId: null as string | null,
  confirmationReference: null as string | null,
});
const offer = () => ({
  id: offerId,
  kind: "package" as const,
  market: "PH" as const,
  currency: "PHP" as const,
  name: "Fixture package",
  draftId,
  draftRevision: 1,
  productId,
  approvalReference: "TEST-APPROVAL",
  approvedBy: userId,
  approvedAt: timestamp,
  withdrawnAt: null as string | null,
  definition: {
    components: [{ productId, quantity: 1 }],
    retailMinor: 10000,
    memberMinor: null,
  },
  contractVersion: 1 as const,
});
function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
function approval() {
  const input = rule();
  return form({
    packageOfferId: input.packageOfferId,
    tierCode: input.tierCode,
    tierName: input.tierName,
    minimumQuantity: String(input.minimumQuantity),
    termsVersion: input.termsVersion,
    termsText: input.termsText,
    codeVersion: input.codeVersion,
    codeText: input.codeText,
    approvalReference: input.approvalReference,
    acknowledged: "on",
  });
}
function withdrawal() {
  return form({ ruleId, reference: "TEST-WITHDRAWAL", acknowledged: "on" });
}
function confirmation() {
  return form({
    enrollmentId,
    externalMemberId: "EXTERNAL-TEST-ID",
    reference: "TEST-VERIFICATION",
    verified: "on",
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  const current = { client: { rpc: f.rpc }, user: { id: userId } };
  f.access.mockResolvedValue({
    user: { id: userId },
    allowed: true,
    mfa: true,
  });
  f.session.mockResolvedValue(current);
  f.requireSession.mockResolvedValue(current);
});

describe("membership administration actions", () => {
  it.each([
    { user: null, allowed: false, mfa: false },
    { user: { id: userId }, allowed: false, mfa: true },
    { user: { id: userId }, allowed: true, mfa: false },
  ])(
    "does not write without a staff identity, role and MFA: %j",
    async (access) => {
      f.access.mockResolvedValue(access);
      for (const [action, input] of [
        [approveMembershipRule, approval()],
        [withdrawMembershipRule, withdrawal()],
        [confirmMembershipEnrollment, confirmation()],
      ] as const)
        expect((await action({ message: "" }, input)).ok).not.toBe(true);
      expect(f.rpc).not.toHaveBeenCalled();
      expect(f.session).not.toHaveBeenCalled();
    },
  );

  it("rejects a changed session identity before issuing a write", async () => {
    f.session.mockResolvedValue({
      client: { rpc: f.rpc },
      user: { id: otherUser },
    });
    expect(
      (await approveMembershipRule({ message: "" }, approval())).ok,
    ).not.toBe(true);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("requires document review acknowledgement and valid package qualification", async () => {
    const unchecked = approval();
    unchecked.delete("acknowledged");
    await approveMembershipRule({ message: "" }, unchecked);
    const invalid = approval();
    invalid.set("minimumQuantity", "1.5");
    await approveMembershipRule({ message: "" }, invalid);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("sends the complete approved document versions and verifies the returned snapshot", async () => {
    f.rpc.mockResolvedValue({ data: rule(), error: null });
    expect((await approveMembershipRule({ message: "" }, approval())).ok).toBe(
      true,
    );
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("approve_membership_rule", {
      p_package_offer: offerId,
      p_tier_code: "TEST_STARTER",
      p_tier_name: "Fixture tier",
      p_minimum_quantity: 1,
      p_terms_version: rule().termsVersion,
      p_terms_text: rule().termsText,
      p_code_version: rule().codeVersion,
      p_code_text: rule().codeText,
      p_reference: "TEST-APPROVAL",
    });
    expect(f.revalidate).toHaveBeenCalledWith("/account/membership");
    f.rpc.mockResolvedValue({
      data: {
        ...rule(),
        termsText: "Different document text in the response.",
      },
      error: null,
    });
    expect(
      (await approveMembershipRule({ message: "" }, approval())).ok,
    ).not.toBe(true);
  });

  it("keeps database denial and missing setup as useful failure feedback", async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(
      (await approveMembershipRule({ message: "" }, approval())).message,
    ).toContain("verified MFA");
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    expect(
      (await approveMembershipRule({ message: "" }, approval())).message,
    ).toContain("setup is pending");
  });

  it("withdraws only after acknowledgement and a verified withdrawal result", async () => {
    const unchecked = withdrawal();
    unchecked.delete("acknowledged");
    await withdrawMembershipRule({ message: "" }, unchecked);
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValueOnce({ data: rule(), error: null });
    expect(
      (await withdrawMembershipRule({ message: "" }, withdrawal())).ok,
    ).not.toBe(true);
    f.rpc.mockResolvedValueOnce({
      data: { ...rule(), withdrawnAt: timestamp },
      error: null,
    });
    expect(
      (await withdrawMembershipRule({ message: "" }, withdrawal())).ok,
    ).toBe(true);
  });

  it("requires explicit external-record verification and checks the returned member ID", async () => {
    const unchecked = confirmation();
    unchecked.delete("verified");
    await confirmMembershipEnrollment({ message: "" }, unchecked);
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValueOnce({ data: enrollment(), error: null });
    expect(
      (await confirmMembershipEnrollment({ message: "" }, confirmation())).ok,
    ).not.toBe(true);
    f.rpc.mockResolvedValueOnce({
      data: {
        ...enrollment(),
        status: "confirmed",
        confirmedAt: timestamp,
        externalMemberId: "WRONG-EXTERNAL-ID",
      },
      error: null,
    });
    expect(
      (await confirmMembershipEnrollment({ message: "" }, confirmation())).ok,
    ).not.toBe(true);
    f.rpc.mockResolvedValueOnce({
      data: {
        ...enrollment(),
        status: "confirmed",
        confirmedAt: timestamp,
        externalMemberId: "EXTERNAL-TEST-ID",
      },
      error: null,
    });
    expect(
      (await confirmMembershipEnrollment({ message: "" }, confirmation())).ok,
    ).toBe(true);
    expect(f.rpc).toHaveBeenLastCalledWith("confirm_membership_enrollment", {
      p_enrollment: enrollmentId,
      p_external_member_id: "EXTERNAL-TEST-ID",
      p_reference: "TEST-VERIFICATION",
    });
  });

  it("returns retryable feedback after a transport failure without claiming success", async () => {
    f.rpc.mockRejectedValue(new Error("transport fixture"));
    const result = await approveMembershipRule({ message: "" }, approval());
    expect(result.ok).not.toBe(true);
    expect(result.message).toContain("Please retry");
  });
});

describe("membership pages and review controls", () => {
  it("rejects records outside the returned staff market scope", async () => {
    f.rpc.mockResolvedValue({
      data: {
        rules: [{ ...rule(), market: "SG" }],
        enrollments: [],
        markets: ["PH"],
        page: 1,
        hasMore: false,
      },
      error: null,
    });
    await expect(
      MembershipAdministration({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("could not be verified");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it("bounds malformed page inputs and shows paginated package choices without inventing defaults", async () => {
    f.rpc.mockResolvedValueOnce({
      data: {
        rules: [],
        enrollments: [],
        markets: ["PH"],
        page: 1,
        hasMore: false,
      },
      error: null,
    });
    f.rpc.mockResolvedValueOnce({
      data: { offers: [], markets: ["PH"], page: 1, hasMore: true },
      error: null,
    });
    const html = renderToStaticMarkup(
      await MembershipAdministration({
        searchParams: Promise.resolve({ page: "1.5", offerPage: ["2", "3"] }),
      }),
    );
    expect(f.rpc.mock.calls).toEqual([
      ["staff_memberships", { page: 1 }],
      ["staff_commerce_offers", { k: "package", page: 1 }],
    ]);
    expect(html).toContain("Next packages");
    expect(html).toContain("No active approved package");
    expect(html).toContain("disabled");
  });

  it("does not render another customer's enrolment from an unexpected RPC response", async () => {
    f.rpc.mockResolvedValue({
      data: {
        membership: null,
        enrollments: [{ ...enrollment(), userId: otherUser }],
        page: 1,
        hasMore: false,
      },
      error: null,
    });
    await expect(
      AccountMembership({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("could not be verified");
  });

  it("distinguishes pending RIWAY confirmation from active membership benefits", async () => {
    f.rpc.mockResolvedValue({
      data: {
        membership: null,
        enrollments: [enrollment()],
        page: 1,
        hasMore: false,
      },
      error: null,
    });
    const html = renderToStaticMarkup(
      await AccountMembership({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("No confirmed RIWAY membership");
    expect(html).toContain("Awaiting RIWAY confirmation");
    expect(html).toContain("Member pricing becomes available only after RIWAY");
    expect(html).not.toContain("Confirm verified RIWAY record");
  });

  it("shows setup feedback rather than an empty history for a missing membership RPC", async () => {
    f.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    const html = renderToStaticMarkup(
      await AccountMembership({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("awaiting setup");
    expect(html).not.toContain("No qualifying membership purchases");
    f.rpc.mockResolvedValue({ data: null, error: { code: "TRANSPORT" } });
    await expect(
      AccountMembership({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("could not be loaded");
  });

  it("renders plain-text consent safely and exposes confirmation only for paid pending verification", () => {
    const documents = renderToStaticMarkup(
      <MembershipDocuments
        record={{
          ...rule(),
          termsText: "<script>alert('fixture')</script> document text",
        }}
        consentedAt={timestamp}
      />,
    );
    expect(documents).toContain("&lt;script&gt;");
    expect(documents).not.toContain("<script>");
    expect(
      renderToStaticMarkup(
        <MembershipConfirmationForm
          enrollment={{ ...enrollment(), status: "pending_payment" }}
        />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <MembershipConfirmationForm enrollment={enrollment()} />,
      ),
    ).toContain("verified");
  });

  it("offers only active packages from allowed markets in the approval form", () => {
    const html = renderToStaticMarkup(
      <MembershipApprovalForm
        offers={[
          offer(),
          {
            ...offer(),
            id: otherUser,
            market: "SG",
            currency: "SGD",
            name: "Other market package",
          },
          {
            ...offer(),
            id: sponsorId,
            name: "Withdrawn package",
            withdrawnAt: timestamp,
          },
        ]}
        availableMarkets={["PH"]}
      />,
    );
    expect(html).toContain("Fixture package");
    expect(html).not.toContain("Other market package");
    expect(html).not.toContain("Withdrawn package");
    expect(html).toContain('name="acknowledged"');
  });
});
