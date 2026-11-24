"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { session } from "@/lib/data";
import { authProvider } from "@/lib/auth-config";

export type EmailCodeResult = { message: string; ok?: boolean };

// Throwaway clients: the code is requested and checked outside the caller's
// own cookie session, so their sign-in is never replaced.
function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedInEmail() {
  if (authProvider() === "clerk") return null;
  const { user } = await session();
  return user?.email ? { id: user.id, email: user.email } : null;
}

/** Emails a one-time code to the signed-in account's own address (never a typed address). */
export async function sendEmailCode(
  _: EmailCodeResult,
  _form: FormData,
): Promise<EmailCodeResult> {
  try {
    const me = await signedInEmail();
    if (!me) return { message: "Sign in again to continue." };
    const { error } = await anonClient().auth.signInWithOtp({
      email: me.email,
      options: { shouldCreateUser: false },
    });
    if (error)
      return {
        message:
          error.status === 429
            ? "A code was sent recently. Wait a minute, then try again."
            : "The code could not be sent. Please try again shortly.",
      };
    return {
      ok: true,
      message: `We sent a sign-in code to ${me.email.replace(/^(.).*(@.*)$/, "$1…$2")}. It expires soon.`,
    };
  } catch {
    return { message: "The code could not be sent. Please try again shortly." };
  }
}

/** Checks the emailed code, then marks only the caller's current session as verified. */
export async function verifyEmailCode(
  _: EmailCodeResult,
  form: FormData,
): Promise<EmailCodeResult> {
  const code = z
    .string()
    .trim()
    .regex(/^\d{6,10}$/)
    .safeParse(form.get("code"));
  if (!code.success) return { message: "Enter the code from the email." };
  try {
    const me = await signedInEmail();
    if (!me) return { message: "Sign in again to continue." };
    const service = serviceClient();
    if (!service) return { message: "Email verification is not configured." };
    const { client } = await session();
    const claims = await client.auth.getClaims();
    const sessionId = z.uuid().safeParse(claims.data?.claims?.session_id);
    if (!sessionId.success) return { message: "Sign in again to continue." };
    const checked = await anonClient().auth.verifyOtp({
      email: me.email,
      token: code.data,
      type: "email",
    });
    if (checked.error || checked.data.user?.id !== me.id)
      return { message: "That code is not valid or has expired." };
    // The check created a separate session; end it immediately.
    if (checked.data.session)
      await service.auth.admin.signOut(
        checked.data.session.access_token,
        "local",
      );
    const { error } = await service.rpc("record_email_second_factor", {
      p_user: me.id,
      p_session: sessionId.data,
    });
    if (error)
      return {
        message: "Verification could not be saved. Sign in again and retry.",
      };
    return { ok: true, message: "Email code verified." };
  } catch {
    return { message: "Verification is unavailable. Please try again." };
  }
}
