import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
const f = vi.hoisted(() => ({
  getUser: vi.fn(),
  create: vi.fn(),
  clerkUser: null as string | null,
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: f.create }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (callback: Function) => (request: NextRequest) =>
    callback(async () => ({ userId: f.clerkUser }), request),
}));
import { proxy } from "@/proxy";
const event = {} as NextFetchEvent;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  vi.stubEnv("UI_TRANSLATION_APPROVAL_REFERENCE", "SYNTHETIC-ONLY");
  vi.stubEnv("UI_LOCALES_PH", "fil,ms,zh-CN");
  vi.stubEnv("UI_LOCALES_SG", "en");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
  f.clerkUser = null;
  f.getUser.mockResolvedValue({ data: { user: null } });
  f.create.mockReturnValue({ auth: { getUser: f.getUser } });
});
afterEach(() => vi.unstubAllEnvs());
const request = (
  path: string,
  options: ConstructorParameters<typeof NextRequest>[1] = {},
) => new NextRequest("https://riway.example.invalid" + path, options);
it("overwrites spoofed locale and path headers on unprefixed pages", async () => {
  const r = await proxy(
    request("/shop", {
      headers: { "x-riway-locale": "fil", "x-riway-path": "/admin" },
    }),
    event,
  );
  expect(r?.headers.get("x-middleware-request-x-riway-locale")).toBe("en");
  expect(r?.headers.get("x-middleware-request-x-riway-path")).toBe("/shop");
  expect(f.getUser).not.toHaveBeenCalled();
});
it("forwards a locale page to its App Router entrypoint with normalized server headers", async () => {
  const r = await proxy(request("/fil/shop?q=review"), event);
  expect(r?.headers.get("x-middleware-next")).toBe("1");
  expect(r?.headers.get("x-middleware-rewrite")).toBeNull();
  expect(r?.headers.get("x-middleware-request-x-riway-locale")).toBe("fil");
});
it.each(["supabase", "clerk"])(
  "keeps %s authentication on a localized private route",
  async (provider) => {
    vi.stubEnv("AUTH_PROVIDER", provider);
    const r = await proxy(request("/fil/account/orders"), event);
    expect(r?.status).toBe(307);
    expect(r?.headers.get("location")).toBe(
      "https://riway.example.invalid/fil/auth/login",
    );
  },
);
it("preserves a refreshed session cookie on authenticated locale routes", async () => {
  f.create.mockImplementation((_url, _key, options) => ({
    auth: {
      getUser: async () => {
        options.cookies.setAll([
          {
            name: "sb-refresh",
            value: "synthetic-refreshed",
            options: { path: "/" },
          },
        ]);
        return { data: { user: { id: "synthetic" } } };
      },
    },
  }));
  const r = await proxy(request("/fil/account/orders"), event);
  expect(r?.headers.get("x-middleware-next")).toBe("1");
  expect(r?.headers.get("set-cookie")).toContain(
    "sb-refresh=synthetic-refreshed",
  );
  expect(r?.headers.get("x-middleware-request-cookie")).toContain(
    "sb-refresh=synthetic-refreshed",
  );
});
it.each(["supabase", "clerk"])(
  "passes only the approved renewal review target through %s sign-in",
  async (provider) => {
    vi.stubEnv("AUTH_PROVIDER", provider);
    const path =
      "/fil/account/replenishment?review=88000000-0000-4000-8000-000000000003";
    const result = await proxy(request(path), event);
    const location = new URL(result!.headers.get("location")!);
    expect(location.pathname).toBe("/fil/auth/login");
    expect(location.searchParams.get("next")).toBe(path);
    const altered = await proxy(
      request(path + "&next=https://example.invalid"),
      event,
    );
    expect(
      new URL(altered!.headers.get("location")!).searchParams.has("next"),
    ).toBe(false);
  },
);
it("preserves authenticated server-action POST method, body and localized URL", async () => {
  f.getUser.mockResolvedValue({ data: { user: { id: "synthetic" } } });
  const req = request("/fil/account/preferences?test=1", {
    method: "POST",
    body: "synthetic-action-body",
  });
  const r = await proxy(req, event);
  expect(r?.headers.get("x-middleware-next")).toBe("1");
  expect(req.url).toBe(
    "https://riway.example.invalid/fil/account/preferences?test=1",
  );
  expect(req.method).toBe("POST");
  expect(await req.text()).toBe("synthetic-action-body");
});
it.each([
  "/fil/api/checkout",
  "/fil/auth/callback",
  "/fil/admin/returns",
  "/fil/_next/static/a.js",
  "/fil/%2fapi/health",
])("refuses a locale alias for infrastructure %s", async (path) => {
  expect((await proxy(request(path), event))?.status).toBe(404);
  expect(f.getUser).not.toHaveBeenCalled();
});
it("refuses a locale not approved for the selected country", async () => {
  expect(
    (
      await proxy(
        request("/fil/shop", { headers: { cookie: "riway-market=SG" } }),
        event,
      )
    )?.status,
  ).toBe(404);
});
it("canonicalizes English and locale casing only for safe navigation methods", async () => {
  expect(
    (await proxy(request("/en/shop"), event))?.headers.get("location"),
  ).toBe("https://riway.example.invalid/shop");
  expect(
    (await proxy(request("/FIL/shop?q=1"), event))?.headers.get("location"),
  ).toBe("https://riway.example.invalid/fil/shop?q=1");
  expect(
    (await proxy(request("/FIL/account", { method: "POST" }), event))?.status,
  ).toBe(400);
});
