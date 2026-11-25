"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { browserDb } from "@/lib/supabase/browser";
import { authErrorMessage } from "@/lib/auth-feedback";
export function GuestCheckout() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setReady(true);
  }, []);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await browserDb().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: location.origin + "/auth/callback?next=/checkout",
        },
      });
      if (error) throw error;
      setMessage(
        "Check your email for a secure sign-in link or code. Verification is required before an order can be created. Open the link in this browser.",
      );
    } catch (error) {
      setMessage(authErrorMessage(error, "guest"));
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await browserDb().auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;
      if (!data.user?.email_confirmed_at || !data.session)
        throw new Error("Unverified");
      window.location.replace("/checkout");
    } catch {
      setMessage(
        "This code could not be verified. Check the email and code, or request a new link. Your bag remains saved.",
      );
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <h2>Continue as a guest</h2>
      <p>
        Verify your email without choosing a password. A secure order profile is
        created for that email so only you can access your orders. If you
        already have an account, verification signs you into the same account.
        You can choose a password later in Account Security.
      </p>
      <form onSubmit={send} className="stack" aria-busy={busy}>
        <label>
          Email address
          <input
            type="email"
            name="guest-email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setToken("");
            }}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <label className="check">
          <input type="checkbox" required />I have read the{" "}
          <Link href="/legal/privacy">privacy notice</Link>.
        </label>
        <button className="button" disabled={!ready || busy}>
          Send secure sign-in link
        </button>
      </form>
      <details>
        <summary>Enter an emailed code instead</summary>
        <form onSubmit={verify} className="stack">
          <label>
            Email code
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              name="guest-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              minLength={6}
              maxLength={10}
            />
          </label>
          <button
            className="button button-outline"
            disabled={!ready || busy || !email}
          >
            Verify and continue checkout
          </button>
        </form>
      </details>
      <p role="status">{message}</p>
      <Link href="/auth/login">Sign in with a password</Link>
    </section>
  );
}
