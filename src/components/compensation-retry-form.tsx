"use client";

import { useActionState } from "react";
import { retryCompensationEvent } from "@/app/admin/compensation/actions";

export function CompensationRetryForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(retryCompensationEvent, {
    message: "",
  });
  return (
    <form action={action} className="admin-actions" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <button className="button button-outline" disabled={pending}>
        {pending ? "Queuing…" : "Retry"}
      </button>
      <span role="status">{state.message}</span>
    </form>
  );
}
