"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

async function referralRequest(
  path: "remember" | "complete",
  method = "POST",
  code?: string,
) {
  const response = await fetch(`/api/referral/${path}`, {
    method,
    // Finish saving the small introduction even if another navigation starts.
    keepalive: path === "remember" && method === "POST",
    headers: { "Content-Type": "application/json" },
    ...(code ? { body: JSON.stringify({ code }) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message ??
        "Your introduction could not be saved. Please try again.",
    );
  return data as { state: string; message: string; canLink?: boolean };
}

export function Referral({ code }: { code: string }) {
  const started = useRef("");
  const inFlight = useRef(false);
  const [message, setMessage] = useState("Saving your verified introduction…");
  const [busy, setBusy] = useState(true);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(false);
  async function remember() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRetry(false);
    try {
      const result = await referralRequest("remember", "POST", code);
      setSaved(true);
      setMessage(result.message);
      if (result.canLink) {
        const linked = await referralRequest("complete");
        setMessage(linked.message);
        setSaved(false);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your introduction could not be saved. Please try again.",
      );
      setRetry(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current === code) return;
    started.current = code;
    void remember();
  }, [code]);
  return (
    <div className="stack">
      <p role="status">{message}</p>
      <p className="small muted">
        A functional cookie remembers the first saved introduction on this
        browser for up to 30 days. Linking does not create membership, placement
        or commission entitlements.{" "}
        <Link href="/legal/privacy">Privacy details</Link>.
      </p>
      <div className="admin-actions">
        <Link
          className="button"
          href="/auth/login"
          aria-disabled={busy}
          tabIndex={busy ? -1 : undefined}
          onClick={(event) => {
            // Finish writing the pending cookie before navigating to sign-in.
            if (busy) event.preventDefault();
          }}
        >
          Sign in or create an account
        </Link>
        {retry && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => void remember()}
          >
            Retry introduction
          </button>
        )}
        {(saved || retry) && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              try {
                const result = await referralRequest("remember", "DELETE");
                setMessage(result.message);
                setSaved(false);
                setRetry(false);
              } catch {
                setMessage(
                  "The saved introduction could not be cleared. Please try again.",
                );
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            Clear saved introduction
          </button>
        )}
      </div>
    </div>
  );
}

export function PendingReferral() {
  const started = useRef(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(false);
  const [busy, setBusy] = useState(false);
  async function complete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRetry(false);
    try {
      const result = await referralRequest("complete");
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your saved introduction could not be linked. Please retry.",
      );
      setRetry(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void complete();
  }, []);
  if (!message) return null;
  return (
    <div className="notice">
      <p role="status">{message}</p>
      {retry && (
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() => void complete()}
        >
          Retry saved introduction
        </button>
      )}
    </div>
  );
}
