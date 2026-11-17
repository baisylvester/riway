"use client";

import { useState, type FormEvent } from "react";
import {
  advanceSampleMembership,
  sampleMembershipPackages,
  sampleMembershipQualification,
  type SampleMembershipStage,
} from "@/lib/membership-sample";
import {
  membershipStatusLabels,
  type MembershipQualification,
} from "@/lib/membership";
import { MembershipConsentFields } from "./membership-consent";

type SampleRecord = {
  qualification: MembershipQualification;
  quantity: number;
  consentedAt: string;
  stage: SampleMembershipStage;
};
export function MembershipDemo() {
  const [packageKey, setPackageKey] = useState("sample-starter");
  const [quantity, setQuantity] = useState("1");
  const [record, setRecord] = useState<SampleRecord | null>(null);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const selected = sampleMembershipPackages.find(
    (item) => item.key === packageKey,
  )!;
  const qualification = sampleMembershipQualification(
    packageKey,
    Number(quantity),
  );

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!qualification || form.get("membershipConsent") !== "on") {
      setMessage(
        "Choose a qualifying quantity and acknowledge both sample documents.",
      );
      return;
    }
    setRecord({
      qualification,
      quantity: Number(quantity),
      consentedAt: new Date().toISOString(),
      stage: "pending_payment",
    });
    setMessage("Sample application created. No payment has been made.");
  }
  function advance(action: "pay" | "confirm" | "cancel") {
    if (!record) return;
    const stage = advanceSampleMembership(record.stage, action);
    setRecord({ ...record, stage });
    setMessage(
      stage === "pending_verification"
        ? "Sample payment verified. The sample application now awaits RIWAY confirmation."
        : stage === "confirmed"
          ? "Sample confirmation complete. This has not changed your real account or pricing."
          : "Sample payment cancelled. No membership was created.",
    );
  }
  return (
    <div className="two-column">
      <form className="panel stack" onSubmit={start}>
        <h2>Choose a sample package</h2>
        <label>
          Sample package
          <select
            value={packageKey}
            disabled={record !== null}
            onChange={(event) => setPackageKey(event.target.value)}
          >
            {sampleMembershipPackages.map((item) => (
              <option key={item.key} value={item.key}>
                {item.qualification.packageName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Package quantity
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            required
            value={quantity}
            disabled={record !== null}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <p className="small muted">
          Sample tier: {selected.qualification.tierName}. Minimum qualifying
          quantity: {selected.qualification.minimumQuantity}.
        </p>
        {!record && (
          <MembershipConsentFields
            key={`${packageKey}:${quantity}:${attempt}`}
            qualification={selected.qualification}
            sample
          />
        )}
        {!record && (
          <button className="button" disabled={!qualification}>
            Create sample application
          </button>
        )}
      </form>
      <div className="panel stack">
        <h2>Sample membership status</h2>
        {record ? (
          <>
            <p>
              <strong>{membershipStatusLabels[record.stage]}</strong>
            </p>
            <p>
              {record.qualification.tierName} · {record.quantity} package(s)
            </p>
            <p>Sponsor: SAMPLE-DISTRIBUTOR</p>
            <p className="small">
              Sample consent recorded at {record.consentedAt} for{" "}
              {record.qualification.termsVersion} and{" "}
              {record.qualification.codeVersion}.
            </p>
            {record.stage === "pending_payment" && (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={() => advance("pay")}
                >
                  Simulate successful payment
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => advance("cancel")}
                >
                  Simulate cancelled payment
                </button>
              </>
            )}
            {record.stage === "pending_verification" && (
              <button
                type="button"
                className="button"
                onClick={() => advance("confirm")}
              >
                Simulate RIWAY confirmation
              </button>
            )}
            {record.stage === "confirmed" && (
              <p className="notice">
                Sample member SAMPLE-MEMBER-001. Real membership and member
                pricing remain unchanged.
              </p>
            )}
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setRecord(null);
                setAttempt((value) => value + 1);
                setMessage("");
              }}
            >
              Reset demonstration
            </button>
          </>
        ) : (
          <p>Select a package and acknowledge its sample documents to begin.</p>
        )}
        <p role="status">{message}</p>
        <p className="small muted">
          Demonstration data stays in this page’s memory and resets on refresh.
          No order, payment, sponsor relationship or membership record is saved
          to your account.
        </p>
      </div>
    </div>
  );
}
