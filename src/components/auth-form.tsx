"use client";
import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { browserDb } from "@/lib/supabase/browser";
import { authErrorMessage } from "@/lib/auth-feedback";
export function AuthForm({
  mode = "login",
}: {
  mode?: "login" | "register" | "reset" | "update";
}) {
  const statusId = useId();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email") ?? "").trim(),
      password = String(f.get("password") ?? "");
    let navigating = false;
    try {
      const client = browserDb();
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // Authentication changes the cookie boundary. A document navigation
        // cannot reuse a signed-out redirect cached by Next route prefetching.
        navigating = true;
        setMessage("Signed in. Opening your account…");
        window.location.replace("/account");
      }
      if (mode === "register") {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin + "/auth/callback" },
        });
        if (error) throw error;
        setMessage(
          "Check your email to confirm your account. This creates a website account; RIWAY membership requires a verified qualifying purchase.",
        );
      }
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo:
            location.origin + "/auth/callback?next=/auth/update-password",
        });
        if (error) throw error;
        setMessage(
          "If an account exists, a password reset email will arrive shortly.",
        );
      }
      if (mode === "update") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        navigating = true;
        window.location.replace("/account");
      }
    } catch (error) {
      navigating = false;
      setMessage(authErrorMessage(error, mode));
    } finally {
      if (!navigating) setBusy(false);
    }
  }
  return (
    <form
      method="post"
      aria-describedby={message ? statusId : undefined}
      aria-busy={busy}
      className="stack"
      onSubmit={submit}
    >
      {mode !== "update" && (
        <label>
          Email address
          <input
            aria-describedby={message ? statusId : undefined}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
      )}
      {mode !== "reset" && (
        <label>
          Password
          <input
            aria-describedby={message ? statusId : undefined}
            name="password"
            type="password"
            minLength={mode === "login" ? undefined : 12}
            maxLength={mode === "login" ? undefined : 128}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
          />
        </label>
      )}
      {mode === "register" && (
        <label className="checkbox">
          <input type="checkbox" required />
          <span>
            I have read the <Link href="/legal/privacy">privacy notice</Link>{" "}
            and understand that this is a development platform.
          </span>
        </label>
      )}
      <button className="button" disabled={!ready || busy}>
        {!ready
          ? "Loading sign-in…"
          : busy
            ? "Please wait…"
            : {
                login: "Sign in",
                register: "Create website account",
                reset: "Send reset link",
                update: "Update password",
              }[mode]}
      </button>
      {message && (
        <p id={statusId} className="notice" role="status">
          {message}
        </p>
      )}
      {mode === "login" && (
        <>
          <Link className="return-link" href="/auth/reset">
            Forgot password?
          </Link>
          <p className="small">
            New here?{" "}
            <Link className="return-link" href="/auth/register">
              Create an account
            </Link>
          </p>
        </>
      )}
      {mode !== "login" && (
        <Link className="return-link" href="/auth/login">
          Return to sign in
        </Link>
      )}
    </form>
  );
}
export function SignOut() {
  return (
    <button
      className="button button-outline"
      onClick={async () => {
        const { error } = await browserDb().auth.signOut();
        if (!error) window.location.replace("/");
      }}
    >
      Sign out
    </button>
  );
}
