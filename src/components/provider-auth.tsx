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

export function ClerkLogin({ register = false }: { register?: boolean }) {
  return register ? (
    <SignUp
      routing="hash"
      signInUrl="/auth/login"
      forceRedirectUrl="/account"
    />
  ) : (
    <SignIn
      routing="hash"
      signUpUrl="/auth/register"
      forceRedirectUrl="/account"
    />
  );
}

export function ClerkSignOut() {
  const clerk = useClerk();
  return (
    <button
      className="button button-outline"
      onClick={() => clerk.signOut({ redirectUrl: "/" })}
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
