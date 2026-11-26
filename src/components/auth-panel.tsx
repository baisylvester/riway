import { authProvider } from "@/lib/auth-config";
import { AuthForm } from "./auth-form";
import { ClerkLogin, ClerkSecurity } from "./provider-auth";
import { MFA } from "./mfa";
import { EmailCodePanel } from "./email-code-panel";

export function AuthPanel({
  mode = "login",
  signInTarget,
}: {
  mode?: "login" | "register" | "reset" | "update";
  signInTarget?: string;
}) {
  return authProvider() === "clerk" ? (
    <ClerkLogin register={mode === "register"} signInTarget={signInTarget} />
  ) : (
    <AuthForm mode={mode} signInTarget={signInTarget} />
  );
}

// Staff second step: an emailed code is the primary method; an existing
// authenticator app is still accepted.
export function SecurityPanel() {
  if (authProvider() === "clerk") return <ClerkSecurity />;
  return (
    <>
      <EmailCodePanel />
      <details className="panel">
        <summary>Use an authenticator app instead</summary>
        <MFA />
      </details>
    </>
  );
}
