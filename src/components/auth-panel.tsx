import { authProvider } from "@/lib/auth-config";
import { AuthForm } from "./auth-form";
import { ClerkLogin, ClerkSecurity } from "./provider-auth";
import { MFA } from "./mfa";

export function AuthPanel({
  mode = "login",
}: {
  mode?: "login" | "register" | "reset" | "update";
}) {
  return authProvider() === "clerk" ? (
    <ClerkLogin register={mode === "register"} />
  ) : (
    <AuthForm mode={mode} />
  );
}

export function SecurityPanel() {
  return authProvider() === "clerk" ? <ClerkSecurity /> : <MFA />;
}
