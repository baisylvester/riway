import { describe, expect, it } from "vitest";
import { checkoutSchema } from "../../src/lib/domain";
import { commerceQuoteSchema } from "../../src/lib/commerce-checkout";
import {
  membershipApprovalSchema,
  membershipConfirmationSchema,
  membershipConsentSchema,
  membershipEnrollmentSchema,
  membershipQualificationSchema,
  membershipStatusLabels,
  myMembershipsSchema,
  staffMembershipsSchema,
} from "../../src/lib/membership";

const ids = {
  rule: "86000000-0000-4000-8000-000000000001",
  offer: "86000000-0000-4000-8000-000000000002",
  product: "86000000-0000-4000-8000-000000000003",
  enrollment: "86000000-0000-4000-8000-000000000004",
  order: "86000000-0000-4000-8000-000000000005",
  user: "86000000-0000-4000-8000-000000000006",
  sponsor: "86000000-0000-4000-8000-000000000007",
};
const now = "2026-11-16T08:00:00.000Z";
const documents = {
  termsVersion: "SAMPLE-TERMS-1",
  termsText: "Sample membership terms for isolated acceptance testing only.",
  codeVersion: "SAMPLE-CODE-1",
  codeText: "Sample conduct wording for isolated acceptance testing only.",
};
const qualification = {
  ruleId: ids.rule,
  packageOfferId: ids.offer,
  productId: ids.product,
  packageName: "Sample qualifying package",
  tierCode: "SAMPLE_STARTER",
  tierName: "Sample Starter",
  minimumQuantity: 2,
  ...documents,
};
const consent = {
  ruleId: ids.rule,
  termsVersion: documents.termsVersion,
  codeVersion: documents.codeVersion,
  accepted: true,
};
const enrollment = {
  id: ids.enrollment,
  orderId: ids.order,
  userId: ids.user,
  ruleId: ids.rule,
  packageOfferId: ids.offer,
  market: "PH",
  tierCode: qualification.tierCode,
  tierName: qualification.tierName,
  packageName: qualification.packageName,
  quantity: 2,
  sponsorId: ids.sponsor,
  status: "pending_verification",
  createdAt: now,
  paidAt: now,
  confirmedAt: null,
  consentedAt: now,
  ...documents,
};

describe("membership consent authority", () => {
  it("retains the exact approved identity and document versions", () => {
    expect(membershipConsentSchema.parse(consent)).toEqual(consent);
  });

  it.each([undefined, false, "true", 1, null])(
    "requires explicit boolean acceptance rather than %s",
    (accepted) => {
      expect(
        membershipConsentSchema.safeParse({ ...consent, accepted }).success,
      ).toBe(false);
    },
  );

  it("rejects client-supplied membership privileges or document text", () => {
    for (const extra of [
      { status: "active" },
      { tierCode: "ADMIN_TIER" },
      { userId: ids.user },
      { sponsorId: ids.sponsor },
      { termsText: documents.termsText },
    ]) {
      expect(
        membershipConsentSchema.safeParse({ ...consent, ...extra }).success,
      ).toBe(false);
    }
  });

  it("rejects missing or oversized rule/document identities", () => {
    for (const change of [
      { ruleId: "another-rule" },
      { termsVersion: "" },
      { codeVersion: "  " },
      { codeVersion: "x".repeat(101) },
    ]) {
      expect(
        membershipConsentSchema.safeParse({ ...consent, ...change }).success,
      ).toBe(false);
    }
  });
});

describe("approved membership rule boundary", () => {
  const approval = {
    packageOfferId: qualification.packageOfferId,
    tierCode: qualification.tierCode,
    tierName: qualification.tierName,
    minimumQuantity: "2",
    ...documents,
    approvalReference: "SAMPLE-APPROVAL-ONLY",
  };

  it("parses form quantities while preserving document content for review", () => {
    expect(membershipApprovalSchema.parse(approval)).toEqual({
      ...approval,
      minimumQuantity: 2,
    });
    expect(membershipQualificationSchema.parse(qualification)).toEqual(
      qualification,
    );
  });

  it.each(["", "0", "1.5", "25", "NaN"])(
    "rejects a nonqualifying minimum quantity %s",
    (minimumQuantity) => {
      expect(
        membershipApprovalSchema.safeParse({ ...approval, minimumQuantity })
          .success,
      ).toBe(false);
    },
  );

  it("requires a package identity, bounded approved documents and reference", () => {
    for (const change of [
      { packageOfferId: "unapproved-package" },
      { tierCode: "sample starter" },
      { termsText: "Draft" },
      { codeText: "x".repeat(12001) },
      { approvalReference: "" },
    ]) {
      expect(
        membershipApprovalSchema.safeParse({ ...approval, ...change }).success,
      ).toBe(false);
    }
  });

  it("rejects an incomplete qualification instead of inventing terms or a tier", () => {
    for (const key of [
      "ruleId",
      "packageOfferId",
      "tierCode",
      "termsText",
      "codeVersion",
    ] as const) {
      const { [key]: omitted, ...incomplete } = qualification;
      expect(omitted).toBeDefined();
      expect(membershipQualificationSchema.safeParse(incomplete).success).toBe(
        false,
      );
    }
  });
});

describe("membership confirmation and account evidence", () => {
  const confirmation = {
    enrollmentId: ids.enrollment,
    externalMemberId: "VERIFIED-SAMPLE-EXTERNAL-ID",
    reference: "SAMPLE-VERIFICATION-REFERENCE",
    verified: true,
  };

  it("requires deliberate confirmation of a verified RIWAY record", () => {
    expect(membershipConfirmationSchema.parse(confirmation)).toEqual(
      confirmation,
    );
    for (const change of [
      { verified: false },
      { verified: "true" },
      { externalMemberId: "  " },
      // One character passes no database check, so the form must refuse it too.
      { externalMemberId: "x" },
      { externalMemberId: "x".repeat(129) },
      { reference: "" },
    ]) {
      expect(
        membershipConfirmationSchema.safeParse({ ...confirmation, ...change })
          .success,
      ).toBe(false);
    }
  });

  it("keeps a paid pending enrollment separate from authoritative membership", () => {
    const account = myMembershipsSchema.parse({
      membership: null,
      enrollments: [enrollment],
      page: 1,
      hasMore: false,
    });
    expect(account.membership).toBeNull();
    expect(account.enrollments[0].status).toBe("pending_verification");
    expect(account.enrollments[0].termsText).toBe(documents.termsText);
    expect(membershipStatusLabels[account.enrollments[0].status]).toBe(
      "Awaiting RIWAY confirmation",
    );
  });

  it("retains owner, order, sponsor and terms evidence and rejects unknown states", () => {
    expect(membershipEnrollmentSchema.parse(enrollment)).toMatchObject({
      userId: ids.user,
      orderId: ids.order,
      sponsorId: ids.sponsor,
      termsVersion: documents.termsVersion,
      codeVersion: documents.codeVersion,
    });
    expect(
      membershipEnrollmentSchema.safeParse({ ...enrollment, status: "active" })
        .success,
    ).toBe(false);
  });

  it("bounds account/staff pagination and rejects malformed market data", () => {
    const account = {
      membership: null,
      enrollments: [],
      page: 1,
      hasMore: false,
    };
    const staff = {
      rules: [],
      enrollments: [],
      markets: ["PH"],
      page: 1,
      hasMore: false,
    };
    expect(staffMembershipsSchema.parse(staff)).toEqual(staff);
    for (const page of [0, 1.5, 1001]) {
      expect(myMembershipsSchema.safeParse({ ...account, page }).success).toBe(
        false,
      );
      expect(staffMembershipsSchema.safeParse({ ...staff, page }).success).toBe(
        false,
      );
    }
    expect(
      staffMembershipsSchema.safeParse({ ...staff, markets: ["US"] }).success,
    ).toBe(false);
  });
});

describe("membership checkout contract", () => {
  const checkout = {
    market: "PH",
    items: [{ productId: ids.product, quantity: 2 }],
    address: {
      full_name: "Sample Customer",
      phone: "0000000000",
      line1: "Sample address for validation only",
      city: "Manila",
      postal_code: "1000",
      country: "PH",
    },
    terms: true,
    termsVersion: "SAMPLE-CHECKOUT-1",
    idempotencyKey: ids.order,
    quoteHash: "a".repeat(64),
  };
  function quote() {
    return {
      market: "PH",
      currency: "PHP",
      items: [
        {
          productId: ids.product,
          name: qualification.packageName,
          quantity: 2,
          unitMinor: 100,
          grossMinor: 200,
          discountMinor: 0,
          netMinor: 200,
          packageOfferId: ids.offer,
        },
      ],
      subtotalMinor: 200,
      discountMinor: 0,
      totalMinor: 200,
      promotion: null,
      membership: qualification,
      quoteHash: "a".repeat(64),
    };
  }

  it("carries explicit membership consent without changing ordinary checkout", () => {
    expect(checkoutSchema.parse(checkout).membershipConsent).toBeUndefined();
    expect(
      checkoutSchema.parse({ ...checkout, membershipConsent: consent })
        .membershipConsent,
    ).toEqual(consent);
    expect(
      checkoutSchema.safeParse({
        ...checkout,
        membershipConsent: { ...consent, accepted: false },
      }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        ...checkout,
        membershipConsent: { ...consent, tierName: "Forged privilege" },
      }).success,
    ).toBe(false);
  });

  it("accepts qualification only for the exact quoted package version and minimum quantity", () => {
    expect(commerceQuoteSchema.parse(quote()).membership).toEqual(
      qualification,
    );
    for (const change of [
      { productId: ids.user },
      { packageOfferId: ids.rule },
      { minimumQuantity: 3 },
    ]) {
      const q = quote();
      expect(
        commerceQuoteSchema.safeParse({
          ...q,
          membership: { ...q.membership, ...change },
        }).success,
      ).toBe(false);
    }
  });

  it("preserves nonqualifying and legacy quotes without manufacturing enrollment", () => {
    const q = quote();
    expect(
      commerceQuoteSchema.parse({ ...q, membership: null }).membership,
    ).toBeNull();
    const { membership: ignored, ...legacy } = q;
    expect(ignored).toBeDefined();
    expect(commerceQuoteSchema.parse(legacy).membership).toBeUndefined();
  });
});
