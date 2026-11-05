"use client";
import { useState } from "react";
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
            const response = await fetch("/api/referral", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code }),
            });
            const data = await response.json();
            setMessage(
              !response.ok
                ? "Sign in to link this verified distributor. An existing sponsor cannot be replaced."
                : data.message,
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
