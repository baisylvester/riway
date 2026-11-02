"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/browser";
export function Referral({ code }: { code: string }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { data, error } = await browserDb().rpc("claim_referral", {
              c: code,
            });
            setMessage(
              error
                ? "Sign in to link this verified distributor. An existing sponsor cannot be replaced."
                : String(data),
            );
          } catch {
            setMessage("Your referral could not be linked. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Link this referring distributor
      </button>
      <p role="status">{message}</p>
    </>
  );
}
