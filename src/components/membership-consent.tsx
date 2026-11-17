import type { MembershipQualification } from "@/lib/membership";

export function MembershipConsentFields({
  qualification,
  sample = false,
}: {
  qualification: MembershipQualification;
  sample?: boolean;
}) {
  return (
    <fieldset className="stack">
      <legend>{sample ? "Sample membership" : "Membership enrolment"}</legend>
      <p>
        {qualification.packageName} qualifies for {qualification.tierName} with
        at least {qualification.minimumQuantity} package
        {qualification.minimumQuantity === 1 ? "" : "s"}.
      </p>
      <p className="small muted">
        {sample
          ? "This demonstration does not create a RIWAY member or charge a payment."
          : "After verified payment, your application awaits confirmation against RIWAY's member records. Member pricing begins only after confirmation."}
      </p>
      <details>
        <summary>Enrolment Terms · {qualification.termsVersion}</summary>
        <p className="small" style={{ whiteSpace: "pre-wrap" }}>
          {qualification.termsText}
        </p>
      </details>
      <details>
        <summary>Code of Conduct · {qualification.codeVersion}</summary>
        <p className="small" style={{ whiteSpace: "pre-wrap" }}>
          {qualification.codeText}
        </p>
      </details>
      <label className="checkbox">
        <input type="checkbox" name="membershipConsent" required />
        <span>
          {sample ? "I acknowledge the sample" : "I accept the displayed"}{" "}
          Enrolment Terms ({qualification.termsVersion}) and Code of Conduct (
          {qualification.codeVersion}).
        </span>
      </label>
    </fieldset>
  );
}
