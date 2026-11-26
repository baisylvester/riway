import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { NextFetchEvent } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { authProvider } from "./lib/auth-config";
import { asMarket } from "./lib/domain";
import {
  enabledLocales,
  localizablePath,
  localizedHref,
  replenishmentSignInTarget,
  splitLocalePath,
} from "./lib/locales";
function routeResponse(request: NextRequest) {
  const route = splitLocalePath(request.nextUrl.pathname),
    headers = new Headers(request.headers);
  // Never trust locale/path headers supplied by the browser or an upstream.
  headers.set("x-riway-locale", route.prefixed ? route.locale : "en");
  headers.set("x-riway-path", route.path);
  return NextResponse.next({ request: { headers } });
}
function signInUrl(request: NextRequest) {
  const route = splitLocalePath(request.nextUrl.pathname);
  const login = new URL(
    localizedHref("/auth/login", route.locale),
    request.url,
  );
  const target = replenishmentSignInTarget(
    request.nextUrl.pathname + request.nextUrl.search,
    asMarket(request.cookies.get("riway-market")?.value),
  );
  if (target) login.searchParams.set("next", target);
  return login;
}
const clerkProxy = clerkMiddleware(async (auth, request) => {
  const identity = await auth();
  const protectedPage = [
    "/account",
    "/admin",
    "/distributor",
    "/operations",
  ].some(
    (prefix) =>
      splitLocalePath(request.nextUrl.pathname).path === prefix ||
      splitLocalePath(request.nextUrl.pathname).path.startsWith(prefix + "/"),
  );
  const response =
    !identity.userId && protectedPage
      ? NextResponse.redirect(signInUrl(request))
      : routeResponse(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const route = splitLocalePath(request.nextUrl.pathname);
  if (route.prefixed) {
    if (
      !enabledLocales(
        asMarket(request.cookies.get("riway-market")?.value),
      ).includes(route.locale) ||
      !localizablePath(route.path)
    )
      return new NextResponse("Not found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    const canonical = localizedHref(route.path, route.locale);
    if (canonical !== request.nextUrl.pathname) {
      if (!["GET", "HEAD"].includes(request.method))
        return new NextResponse("Invalid locale URL", { status: 400 });
      const target = request.nextUrl.clone();
      target.pathname = canonical;
      return NextResponse.redirect(target, 308);
    }
  }
  if (authProvider() === "clerk") return clerkProxy(request, event);
  let response = routeResponse(request);
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
      (prefix) => route.path === prefix || route.path.startsWith(prefix + "/"),
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
        response = routeResponse(request);
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const {
    data: { user },
  } = await client.auth.getUser();
  const path = route.path;
  if (
    !user &&
    ["/account", "/admin", "/distributor", "/operations"].some(
      (prefix) => path === prefix || path.startsWith(prefix + "/"),
    )
  ) {
    const redirect = NextResponse.redirect(signInUrl(request));
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
