import Link from "@/components/localized-link";
import { markets } from "@/lib/domain";
import {
  membershipStatusLabels,
  type MembershipEnrollment,
  type MembershipRule,
} from "@/lib/membership";
import {
  MembershipConfirmationForm,
  MembershipRejectionForm,
} from "./membership-admin-forms";

function date(value: string) {
  return `${new Date(value).toLocaleString("en-SG", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  })} UTC`;
}

export function MembershipDocuments({
  record,
  consentedAt,
}: {
  record: Pick<
    MembershipRule,
    "termsVersion" | "termsText" | "codeVersion" | "codeText"
  >;
  consentedAt?: string;
}) {
  return (
    <details>
      <summary>
        {consentedAt ? "Recorded enrolment consent" : "Approved documents"}
      </summary>
      <div className="stack" style={{ marginTop: 15 }}>
        {consentedAt && <p>Accepted {date(consentedAt)}.</p>}
        <h3>Enrolment Terms · {record.termsVersion}</h3>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {record.termsText}
        </p>
        <h3>Code of Conduct · {record.codeVersion}</h3>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {record.codeText}
        </p>
      </div>
    </details>
  );
}

const explanations = {
  pending_payment:
    "Payment must be confirmed before this membership application can proceed.",
  pending_verification:
    "Payment is confirmed. Member pricing becomes available only after RIWAY verifies and confirms the member record.",
  confirmed:
    "The qualifying purchase was linked to a verified RIWAY member record. Your current membership status is shown separately.",
  not_applied:
    "A membership or earlier application already exists. This purchase did not create another membership.",
  cancelled:
    "The qualifying payment was cancelled. This application did not create a membership.",
  rejected:
    "RIWAY could not verify this application against its member records. No membership was created. You may apply again with a new qualifying purchase, or contact RIWAY support.",
};

export function MembershipEnrollmentRecord({
  enrollment,
  staff = false,
}: {
  enrollment: MembershipEnrollment;
  staff?: boolean;
}) {
  return (
    <article className="panel stack">
      <div className="admin-actions">
        <h3>{enrollment.packageName}</h3>
        <span className="status">
          {membershipStatusLabels[enrollment.status]}
        </span>
      </div>
      <p>{explanations[enrollment.status]}</p>
      <dl>
        <dt>Qualification</dt>
        <dd>
          {enrollment.quantity} × {enrollment.packageName} ·{" "}
          {markets[enrollment.market].name}
        </dd>
        <dt>Recorded tier</dt>
        <dd>
          {enrollment.tierName} ({enrollment.tierCode})
        </dd>
        <dt>Order</dt>
        <dd style={{ overflowWrap: "anywhere" }}>
          {staff ? (
            enrollment.orderId
          ) : (
            <Link href={`/account/orders/${enrollment.orderId}`}>
              {enrollment.orderId}
            </Link>
          )}
        </dd>
        {staff && (
          <>
            <dt>Customer account ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{enrollment.userId}</dd>
          </>
        )}
        {enrollment.sponsorMemberId && (
          <>
            <dt>Sponsor RIWAY member ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {enrollment.sponsorMemberId}
            </dd>
          </>
        )}
        <dt>Recorded sponsor ID</dt>
        <dd style={{ overflowWrap: "anywhere" }}>{enrollment.sponsorId}</dd>
        <dt>Created</dt>
        <dd>{date(enrollment.createdAt)}</dd>
        {enrollment.paidAt && (
          <>
            <dt>Payment confirmed</dt>
            <dd>{date(enrollment.paidAt)}</dd>
          </>
        )}
        {enrollment.confirmedAt && (
          <>
            <dt>RIWAY record confirmed</dt>
            <dd>{date(enrollment.confirmedAt)}</dd>
          </>
        )}
        {enrollment.externalMemberId && (
          <>
            <dt>RIWAY member ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {enrollment.externalMemberId}
            </dd>
          </>
        )}
        {staff && enrollment.confirmationReference && (
          <>
            <dt>Verification reference</dt>
            <dd>{enrollment.confirmationReference}</dd>
          </>
        )}
        {enrollment.rejectedAt && (
          <>
            <dt>Reviewed, not confirmed</dt>
            <dd>{date(enrollment.rejectedAt)}</dd>
          </>
        )}
        {staff && enrollment.rejectionReference && (
          <>
            <dt>Review reference</dt>
            <dd>{enrollment.rejectionReference}</dd>
          </>
        )}
      </dl>
      <MembershipDocuments
        record={enrollment}
        consentedAt={enrollment.consentedAt}
      />
      {staff && <MembershipConfirmationForm enrollment={enrollment} />}
      {staff && <MembershipRejectionForm enrollment={enrollment} />}
    </article>
  );
}
