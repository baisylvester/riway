import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";
import { authProvider } from "@/lib/auth-config";
import { cookies } from "next/headers";
import { asMarket } from "@/lib/domain";
import { authReturnPath, splitLocalePath, localizedHref } from "@/lib/locales";
export async function GET(request: Request) {
  if (authProvider() === "clerk")
    return NextResponse.redirect(new URL("/auth/login", request.url));
  const url = new URL(request.url),
    code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = authReturnPath(
    next,
    asMarket((await cookies()).get("riway-market")?.value),
  );
  if (code) {
    const { error } = await (await db()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
  }
  return NextResponse.redirect(
    new URL(
      localizedHref(
        "/auth/login?error=confirmation",
        splitLocalePath(destination).locale,
      ),
      url.origin,
    ),
  );
}
