"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/browser";
import { authenticatorQr } from "@/lib/authenticator-qr";
import { AuthenticatorQr } from "@/components/authenticator-qr";
export function MFA() {
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState<ReturnType<typeof authenticatorQr> | null>(null),
    [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  return (
    <div className="panel stack">
      <h2>Protect your account</h2>
      <p className="muted small">
        Staff access requires a verified authenticator code. Set up an
        authenticator or verify your existing one.
      </p>
      <button
        className="button button-outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setQr(null);
          setFactor("");
          setCode("");
          try {
            const c = browserDb();
            const { data: fs, error: fe } = await c.auth.mfa.listFactors();
            if (fe) throw fe;
            const verified = fs.totp.find((f) => f.status === "verified");
            if (verified) {
              setFactor(verified.id);
              setMessage("Enter your authenticator code.");
            } else {
              for (const f of fs.all.filter(
                (f) => f.factor_type === "totp" && f.status === "unverified",
              )) {
                const { error } = await c.auth.mfa.unenroll({ factorId: f.id });
                if (error) throw error;
              }
              const { data, error } = await c.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "RIWAY authenticator",
              });
              if (error) throw error;
              const image = authenticatorQr(data.totp.uri);
              setFactor(data.id);
              setQr(image);
              setMessage(
                "Scan this QR code with your authenticator, then enter its code.",
              );
            }
          } catch {
            setMessage(
              "Authenticator setup could not be completed. Try signing in again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Set up or verify authenticator
      </button>
      {qr && (
        <>
          <AuthenticatorQr qr={qr} />
          <details>
            <summary>Can’t scan? Enter a setup key</summary>
            <p>
              In your authenticator, add a time-based account named RIWAY and
              enter this key:
            </p>
            <code>{qr.secret}</code>
          </details>
        </>
      )}
      {factor && (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const c = browserDb();
              const { error } = await c.auth.mfa.challengeAndVerify({
                factorId: factor,
                code,
              });
              if (error) throw error;
              setQr(null);
              setFactor("");
              setCode("");
              setMessage("Authenticator verified.");
              router.refresh();
            } catch {
              setMessage(
                "The code could not be verified. Try the current six-digit code.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Authenticator code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Verify
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
