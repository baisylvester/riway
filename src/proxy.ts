import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { authProvider } from "./lib/auth-config";
const clerkProxy = clerkMiddleware(async (auth, request) => {
  const identity = await auth();
  const protectedPage = [
    "/account",
    "/admin",
    "/distributor",
    "/operations",
  ].some(
    (prefix) =>
      request.nextUrl.pathname === prefix ||
      request.nextUrl.pathname.startsWith(prefix + "/"),
  );
  const response =
    !identity.userId && protectedPage
      ? NextResponse.redirect(new URL("/auth/login", request.url))
      : NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (authProvider() === "clerk") return clerkProxy(request, event);
  let response = NextResponse.next({ request });
  if (
    ![
      "/account",
      "/admin",
      "/distributor",
      "/operations",
      "/api",
      "/auth",
      "/checkout",
    ].some(
      (prefix) =>
        request.nextUrl.pathname === prefix ||
        request.nextUrl.pathname.startsWith(prefix + "/"),
    )
  )
    return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  const path = request.nextUrl.pathname;
  if (
    !user &&
    ["/account", "/admin", "/distributor", "/operations"].some(
      (prefix) => path === prefix || path.startsWith(prefix + "/"),
    )
  ) {
    const redirect = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next|images|design|fonts|favicon.ico).*)",
    "/account/:path*",
    "/admin/:path*",
    "/distributor/:path*",
    "/api/:path*",
    "/checkout",
    "/auth/:path*",
  ],
};
