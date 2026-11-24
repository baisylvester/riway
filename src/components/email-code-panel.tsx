"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendEmailCode, verifyEmailCode } from "@/app/auth/email-code-actions";

// Staff second step by email: send a one-time code to the account email, then
// enter it. Success marks only this browser session for 12 hours.
export function EmailCodePanel() {
  const router = useRouter();
  const [sent, send, sending] = useActionState(sendEmailCode, { message: "" });
  const [checked, check, checking] = useActionState(verifyEmailCode, {
    message: "",
  });
  useEffect(() => {
    if (checked.ok) router.refresh();
  }, [checked.ok, router]);
  return (
    <div className="panel stack">
      <h2>Verify by email</h2>
      <p className="muted">
        Staff access needs a second step. We will email a one-time code to your
        account address. Verification lasts 12 hours in this browser.
      </p>
      <form action={send}>
        <button className="button button-outline" disabled={sending}>
          {sending ? "Sending…" : "Email me a code"}
        </button>
      </form>
      <p role="status">{sent.message}</p>
      <p className="muted">
        Already received a code? Enter it below. Request another only if needed.
      </p>
      <form action={check} className="stack">
        <label>
          Code from the email
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            required
          />
        </label>
        <button className="button" disabled={checking}>
          {checking ? "Checking…" : "Verify"}
        </button>
      </form>
      <p role="status">{checked.message}</p>
    </div>
  );
}
