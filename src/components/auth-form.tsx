"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { browserDb } from "@/lib/supabase/browser";
export function AuthForm({
  mode = "login",
}: {
  mode?: "login" | "register" | "reset" | "update";
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget),
      client = browserDb(),
      email = String(f.get("email") ?? ""),
      password = String(f.get("password") ?? "");
    try {
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/account");
        router.refresh();
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
        router.push("/account");
        router.refresh();
      }
    } catch {
      setMessage(
        mode === "login"
          ? "Sign-in failed. Check your credentials and email confirmation."
          : "The request could not be completed. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      {mode !== "update" && (
        <label>
          Email address
          <input
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
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
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
      <button className="button" disabled={busy}>
        {busy
          ? "Please wait…"
          : {
              login: "Sign in",
              register: "Create website account",
              reset: "Send reset link",
              update: "Update password",
            }[mode]}
      </button>
      {message && (
        <p className="notice" role="status">
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
  const router = useRouter();
  return (
    <button
      className="button button-outline"
      onClick={async () => {
        await browserDb().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
