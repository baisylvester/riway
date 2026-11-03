import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = next === "/auth/update-password" ? next : "/account";
  if (code) {
    const { error } = await (await db()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
  }
  return NextResponse.redirect(
    new URL("/auth/login?error=confirmation", url.origin),
  );
}
