"use client";

import { useActionState } from "react";
import {
  approveMembershipRule,
  confirmMembershipEnrollment,
  rejectMembershipEnrollment,
  withdrawMembershipRule,
} from "@/app/admin/memberships/actions";
import type { CommerceOffer } from "@/lib/commerce-offers";
import { markets, type Market } from "@/lib/domain";
import type { MembershipEnrollment, MembershipRule } from "@/lib/membership";

export function MembershipApprovalForm({
  offers,
  availableMarkets,
}: {
  offers: CommerceOffer[];
  availableMarkets: Market[];
}) {
  const [state, action, pending] = useActionState(approveMembershipRule, {
    message: "",
  });
  const packages = offers.filter(
    (offer) =>
      offer.kind === "package" &&
      offer.withdrawnAt === null &&
      availableMarkets.includes(offer.market),
  );
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h2>Approve a membership rule</h2>
      <p>
        Connect an approved package to its first-membership tier and the exact
        enrolment documents customers must accept. Approved versions are kept
        with qualifying orders.
      </p>
      {!packages.length && (
        <p className="notice">
          No active approved package is available on this package page. Browse
          the other package pages or approve a package before adding a rule.
        </p>
      )}
      <fieldset
        className="stack"
        disabled={pending || !!state.ok || !packages.length}
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        <label>
          Approved package
          <select name="packageOfferId" required defaultValue="">
            <option value="">Select an approved package</option>
            {packages.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name} · {markets[offer.market].name} · {offer.id}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Tier code
            <input
              name="tierCode"
              required
              minLength={2}
              maxLength={40}
              pattern="[A-Z0-9_\-]{2,40}"
              autoCapitalize="characters"
            />
          </label>
          <label>
            Tier name
            <input name="tierName" required minLength={2} maxLength={80} />
          </label>
          <label>
            Minimum package quantity
            <input
              name="minimumQuantity"
              type="number"
              min={1}
              max={24}
              step={1}
              defaultValue={1}
              required
            />
          </label>
          <label>
            Approval reference
            <input
              name="approvalReference"
              required
              minLength={5}
              maxLength={200}
            />
          </label>
          <label>
            Enrolment Terms version
            <input name="termsVersion" required minLength={3} maxLength={100} />
          </label>
          <label>
            Code of Conduct version
            <input name="codeVersion" required minLength={3} maxLength={100} />
          </label>
          <label className="full">
            Enrolment Terms
            <textarea
              name="termsText"
              rows={8}
              required
              minLength={20}
              maxLength={12000}
            />
          </label>
          <label className="full">
            Code of Conduct
            <textarea
              name="codeText"
              rows={8}
              required
              minLength={20}
              maxLength={12000}
            />
          </label>
        </div>
        <p className="small muted">
          The minimum counts the selected package quantity. This rule covers a
          first membership; existing memberships and upgrades are not changed.
        </p>
        <label className="checkbox">
          <input name="acknowledged" type="checkbox" required />
          <span>
            I have reviewed the package, tier and complete documents, and have
            authority to approve this membership rule for its market.
          </span>
        </label>
        <button className="button">
          {pending ? "Approving…" : "Approve membership rule"}
        </button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}

export function MembershipWithdrawalForm({ rule }: { rule: MembershipRule }) {
  const [state, action, pending] = useActionState(withdrawMembershipRule, {
    message: "",
  });
  if (rule.withdrawnAt) return null;
  return (
    <details>
      <summary>Withdraw rule</summary>
      <form action={action} className="stack" aria-busy={pending}>
        <input type="hidden" name="ruleId" value={rule.id} />
        <fieldset
          className="stack"
          disabled={pending || !!state.ok}
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <label>
            Withdrawal reference or reason
            <input name="reference" required minLength={5} maxLength={200} />
          </label>
          <label className="checkbox">
            <input name="acknowledged" type="checkbox" required />
            <span>
              Stop this rule for new purchases. Existing orders retain their
              recorded qualification and consent.
            </span>
          </label>
          <button className="button button-outline">
            {pending ? "Withdrawing…" : "Withdraw membership rule"}
          </button>
        </fieldset>
        <p role="status">{state.message}</p>
      </form>
    </details>
  );
}

export function MembershipConfirmationForm({
  enrollment,
}: {
  enrollment: MembershipEnrollment;
}) {
  const [state, action, pending] = useActionState(confirmMembershipEnrollment, {
    message: "",
  });
  if (enrollment.status !== "pending_verification") return null;
  return (
    <details>
      <summary>Confirm an existing RIWAY record</summary>
      <form action={action} className="stack" aria-busy={pending}>
        <input type="hidden" name="enrollmentId" value={enrollment.id} />
        <p>
          Verify this customer, qualifying paid purchase and sponsor against
          RIWAY’s records before linking the external membership.
        </p>
        <fieldset
          className="stack"
          disabled={pending || !!state.ok}
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <label>
            Existing RIWAY member ID
            <input
              name="externalMemberId"
              required
              minLength={2}
              maxLength={128}
            />
          </label>
          <label>
            Sponsor member ID shown in RIWAY
            <input name="sponsorMemberId" required maxLength={128} />
          </label>
          <label>
            Market shown in RIWAY
            <select name="verifiedMarket" required defaultValue="">
              <option value="">Choose a market</option>
              <option value="PH">Philippines</option>
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
            </select>
          </label>
          <label>
            Tier code shown in RIWAY
            <input name="verifiedTier" required minLength={2} maxLength={40} />
          </label>
          <label>
            Verification reference
            <input name="reference" required minLength={5} maxLength={200} />
          </label>
          <label className="checkbox">
            <input name="verified" type="checkbox" required />
            <span>
              I verified the customer’s existing RIWAY member record, sponsor
              and tier against this paid purchase and recorded the supporting
              reference.
            </span>
          </label>
          <button className="button">
            {pending ? "Confirming…" : "Confirm verified RIWAY record"}
          </button>
        </fieldset>
        <p role="status">{state.message}</p>
      </form>
    </details>
  );
}

export function MembershipRejectionForm({
  enrollment,
}: {
  enrollment: MembershipEnrollment;
}) {
  const [state, action, pending] = useActionState(rejectMembershipEnrollment, {
    message: "",
  });
  if (enrollment.status !== "pending_verification") return null;
  return (
    <details>
      <summary>Could not verify against RIWAY records</summary>
      <form action={action} className="stack" aria-busy={pending}>
        <input type="hidden" name="enrollmentId" value={enrollment.id} />
        <p>
          Use this only when this customer cannot be matched to a RIWAY member
          record. The customer may apply again with a new qualifying purchase.
          This does not refund or cancel the paid order.
        </p>
        <fieldset
          className="stack"
          disabled={pending || !!state.ok}
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <label>
            Review reference
            <input name="reference" required minLength={5} maxLength={200} />
          </label>
          <label className="checkbox">
            <input name="acknowledged" type="checkbox" required />
            <span>
              I checked RIWAY’s records and could not verify this application.
            </span>
          </label>
          <button className="button button-outline">
            {pending ? "Saving…" : "Mark as not confirmed"}
          </button>
        </fieldset>
        <p role="status">{state.message}</p>
      </form>
    </details>
  );
}
