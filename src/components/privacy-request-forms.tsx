"use client";
import Link from "next/link";
import { useActionState } from "react";
import {
  submitPrivacyRequest,
  updatePrivacyRequest,
} from "@/app/account/privacy/actions";
import { markets, type Market } from "@/lib/domain";
import {
  privacyKinds,
  privacyStatuses,
  type PrivacyDetail,
} from "@/lib/privacy-requests";

export function PrivacyIntakeForm({ market }: { market: Market }) {
  const [state, action, pending] = useActionState(submitPrivacyRequest, {
    message: "",
  });
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h2>New privacy request</h2>
      <label>
        Market
        <select name="market" defaultValue={market}>
          {Object.entries(markets).map(([code, value]) => (
            <option key={code} value={code}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Request type
        <select name="kind" defaultValue="access">
          {Object.entries(privacyKinds).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        How can we help?
        <textarea
          name="details"
          required
          minLength={20}
          maxLength={2000}
          rows={5}
          aria-describedby="privacy-details-help"
        />
      </label>
      <p id="privacy-details-help" className="small muted">
        Describe the data or change you are requesting. Do not include
        passwords, payment details or identity-document images. If more
        verification is needed, RIWAY will explain the next step here.
      </p>
      <button className="button" disabled={pending}>
        {pending ? "Submitting…" : "Submit request"}
      </button>
      <p role="status">
        {state.message}{" "}
        {state.id && (
          <Link href={`/account/privacy/${state.id}`}>Open request →</Link>
        )}
      </p>
    </form>
  );
}

function RequestFields({
  request,
  operation,
}: {
  request: PrivacyDetail;
  operation: string;
}) {
  return (
    <>
      <input type="hidden" name="id" value={request.id} />
      <input type="hidden" name="revision" value={request.revision} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
}
export function PrivacyMessageForm({ request }: { request: PrivacyDetail }) {
  const [state, action, pending] = useActionState(updatePrivacyRequest, {
    message: "",
  });
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <RequestFields request={request} operation="message" />
      <label>
        Add a message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
        />
      </label>
      <p className="small muted">
        Keep passwords, payment details and identity documents out of your
        message.
      </p>
      <button className="button" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
export function PrivacyWithdrawForm({ request }: { request: PrivacyDetail }) {
  const [state, action, pending] = useActionState(updatePrivacyRequest, {
    message: "",
  });
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <RequestFields request={request} operation="withdraw" />
      <label className="checkbox">
        <input type="checkbox" name="confirmed" required /> I want to withdraw
        this request.
      </label>
      <button className="button button-outline" disabled={pending}>
        {pending ? "Withdrawing…" : "Withdraw request"}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
export function PrivacyReviewForm({ request }: { request: PrivacyDetail }) {
  const [state, action, pending] = useActionState(updatePrivacyRequest, {
    message: "",
  });
  const choices =
    request.status === "in_review"
      ? ["in_review", "needs_information", "completed", "declined"]
      : ["in_review", "needs_information", "declined"];
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <RequestFields request={request} operation="review" />
      <h2>Review request</h2>
      <label>
        Status
        <select name="status" defaultValue="in_review">
          {choices.map((code) => (
            <option key={code} value={code}>
              {privacyStatuses[code as keyof typeof privacyStatuses]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Message to the account holder
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
        />
      </label>
      <p className="small muted">
        This message appears in the customer's account. Give clear next steps or
        explain the outcome. Do not paste internal notes or sensitive documents.
      </p>
      {!request.identityVerified && (
        <label>
          Identity-verification reference
          <input name="verification" minLength={3} maxLength={120} />
          <span className="small muted">
            Record only the approved case/reference after completing RIWAY's
            identity checks. Required before completion.
          </span>
        </label>
      )}
      <label>
        Resolution reference
        <input name="reference" minLength={3} maxLength={120} />
        <span className="small muted">
          Required for completed or declined requests. Use the approved case
          reference, not personal data.
        </span>
      </label>
      <p className="notice">
        Updating the status records manual case handling. Follow RIWAY's
        approved process to fulfil the request and any retention obligations.
      </p>
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : "Save review"}
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}
