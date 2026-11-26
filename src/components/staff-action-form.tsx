"use client";

import { useActionState, type ReactNode } from "react";

type Result = { message: string; ok?: boolean };

// Small wrapper for staff server-action forms with a status message.
export function StaffActionForm({
  action,
  submit,
  children,
}: {
  action: (state: Result, form: FormData) => Promise<Result>;
  submit: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, { message: "" });
  return (
    <form action={run} className="admin-actions staff-form" aria-busy={pending}>
      {children}
      <button className="button button-outline" disabled={pending}>
        {pending ? "Saving…" : submit}
      </button>
      <span role="status">{state.message}</span>
    </form>
  );
}
