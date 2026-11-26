"use client";
import {
  SignIn,
  SignUp,
  UserProfile,
  useClerk,
  useReverification,
} from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { verifyStaffIdentity } from "@/app/verify-identity";
import { useLocale } from "./locale-provider";
import { localizedHref } from "@/lib/locales";

export function ClerkLogin({
  register = false,
  signInTarget,
}: {
  register?: boolean;
  signInTarget?: string;
}) {
  const { locale } = useLocale();
  return register ? (
    <SignUp
      routing="hash"
      signInUrl={localizedHref("/auth/login", locale)}
      forceRedirectUrl={localizedHref("/account", locale)}
    />
  ) : (
    <SignIn
      routing="hash"
      signUpUrl={localizedHref("/auth/register", locale)}
      forceRedirectUrl={signInTarget ?? localizedHref("/account", locale)}
    />
  );
}

export function ClerkSignOut() {
  const { locale } = useLocale();
  const clerk = useClerk();
  return (
    <button
      className="button button-outline"
      onClick={() => clerk.signOut({ redirectUrl: localizedHref("/", locale) })}
    >
      Sign out
    </button>
  );
}

export function ClerkSecurity() {
  const router = useRouter();
  const verify = useReverification(verifyStaffIdentity);
  return (
    <div className="stack">
      <p>
        Staff and store management require a recent second-factor verification.
        Enable an authenticator in your account security settings.
      </p>
      <button
        className="button"
        onClick={async () => {
          const result = await verify();
          if (result?.verified) router.refresh();
        }}
      >
        Verify authenticator
      </button>
      <UserProfile routing="hash" />
    </div>
  );
}
