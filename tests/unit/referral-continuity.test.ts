import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({
  session: vi.fn(),
  values: new Map<string, string>(),
  set: vi.fn(),
}));
vi.mock("@/lib/data", () => ({ session: f.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      f.values.has(name) ? { value: f.values.get(name) } : undefined,
    set: f.set,
  }),
}));
import {
  completePendingReferral,
  pendingReferralCookie,
  referralLifetimeSeconds,
} from "../../src/lib/referral-continuity";
import {
  POST as remember,
  DELETE as clear,
} from "../../src/app/api/referral/remember/route";
import { POST as complete } from "../../src/app/api/referral/complete/route";

const first = "QA-FIRST",
  second = "QA-SECOND";
const request = (
  body: unknown = { code: first },
  origin = "https://riway.example.invalid",
  method = "POST",
) =>
  new Request("https://riway.example.invalid/api/referral/remember", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
let rpc: ReturnType<typeof vi.fn>, client: SupabaseClient;
const distributor = (code: string) => ({
  code,
  display_name: `Fixture ${code}`,
  market: "PH",
});
beforeEach(() => {
  vi.clearAllMocks();
  f.values.clear();
  f.set.mockImplementation(
    (name: string, value: string, options: { maxAge?: number }) => {
      if (options.maxAge === 0) f.values.delete(name);
      else f.values.set(name, value);
    },
  );
  rpc = vi.fn(async (name: string, args: { c: string }) => ({
    data:
      name === "lookup_distributor"
        ? [first, second].includes(args.c)
          ? [distributor(args.c)]
          : []
        : "Your verified referring distributor has been linked.",
    error: null,
  }));
  client = { rpc } as unknown as SupabaseClient;
  f.session.mockResolvedValue({ client, user: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("guest referral continuity boundaries", () => {
  it("rejects cross-origin saves/clears/completions before reading auth or cookies", async () => {
    expect(
      (await remember(request(undefined, "https://evil.invalid"))).status,
    ).toBe(403);
    expect(
      (await clear(request(undefined, "https://evil.invalid", "DELETE")))
        .status,
    ).toBe(403);
    expect(
      (await complete(request(undefined, "https://evil.invalid"))).status,
    ).toBe(403);
    expect(f.session).not.toHaveBeenCalled();
    expect(f.set).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { code: "../bad" },
    { code: "ab" },
    { code: "x".repeat(41) },
    { code: first, extra: "x".repeat(1200) },
  ])("rejects malformed or oversized input %j", async (body) => {
    expect((await remember(request(body))).status).toBe(400);
    expect(f.session).not.toHaveBeenCalled();
    expect(f.set).not.toHaveBeenCalled();
  });
  it("remembers a verified introduction anonymously without claiming or accepting identity fields", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await remember(
      request({ code: first, user_id: "forged", sponsor_id: "forged" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "saved",
      canLink: false,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("lookup_distributor", {
      c: first,
    });
    expect(f.set).toHaveBeenCalledExactlyOnceWith(
      pendingReferralCookie,
      first,
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: referralLifetimeSeconds,
      },
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not save nonexistent, inactive or unverified distributors", async () => {
    expect((await remember(request({ code: "QA-ABSENT" }))).status).toBe(404);
    expect(f.set).not.toHaveBeenCalled();
  });
  it("retains the first saved still-valid code without extending its lifetime", async () => {
    f.values.set(pendingReferralCookie, first);
    const response = await remember(request({ code: second }));
    expect(response.status).toBe(200);
    expect((await response.json()).message).toContain(`Fixture ${first}`);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("lookup_distributor", {
      c: first,
    });
    expect(f.values.get(pendingReferralCookie)).toBe(first);
    expect(f.set).not.toHaveBeenCalled();
  });
  it("replaces invalid or no-longer-verified pending data only with a verified code", async () => {
    f.values.set(pendingReferralCookie, "QA-REVOKED");
    expect((await remember(request({ code: second }))).status).toBe(200);
    expect(rpc.mock.calls.map((args) => args[1])).toEqual([
      { c: "QA-REVOKED" },
      { c: second },
    ]);
    expect(f.values.get(pendingReferralCookie)).toBe(second);
  });
  it("retains a saved introduction when its verification has a transient failure", async () => {
    f.values.set(pendingReferralCookie, first);
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private fixture database failure" },
    });
    const response = await remember(request({ code: second }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(
      "private fixture database failure",
    );
    expect(f.values.get(pendingReferralCookie)).toBe(first);
    expect(f.set).not.toHaveBeenCalled();
  });
  it("allows an explicit same-origin clear without changing account attribution", async () => {
    f.values.set(pendingReferralCookie, first);
    expect((await clear(request(undefined, undefined, "DELETE"))).status).toBe(
      200,
    );
    expect(f.values.has(pendingReferralCookie)).toBe(false);
    expect(f.set).toHaveBeenCalledWith(
      pendingReferralCookie,
      "",
      expect.objectContaining({ maxAge: 0, path: "/", httpOnly: true }),
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("authenticated pending-introduction completion", () => {
  beforeEach(() => {
    f.session.mockResolvedValue({ client, user: { id: "fixture-account" } });
  });
  it("never claims for a guest and preserves the cookie until sign-in", async () => {
    f.values.set(pendingReferralCookie, first);
    f.session.mockResolvedValue({ client, user: null });
    expect((await complete(request())).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(f.values.get(pendingReferralCookie)).toBe(first);
  });
  it("does nothing when there is no pending cookie", async () => {
    expect(await completePendingReferral(client)).toEqual({
      state: "none",
      message: "",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(f.set).not.toHaveBeenCalled();
  });
  it.each(["../bad", "QA-REVOKED"])(
    "clears invalid or revoked pending data %s without claiming",
    async (code) => {
      f.values.set(pendingReferralCookie, code);
      const response = await complete(request());
      expect(response.status).toBe(200);
      expect((await response.json()).state).toBe("invalid");
      expect(rpc.mock.calls.some(([name]) => name === "claim_referral")).toBe(
        false,
      );
      expect(f.values.has(pendingReferralCookie)).toBe(false);
    },
  );
  it("revalidates and claims through the authenticated client, never a submitted account id", async () => {
    f.values.set(pendingReferralCookie, first);
    const response = await complete(
      request({ code: second, user_id: "forged" }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe("linked");
    expect(rpc.mock.calls).toEqual([
      ["lookup_distributor", { c: first }],
      ["claim_referral", { c: first }],
    ]);
    expect(f.values.has(pendingReferralCookie)).toBe(false);
    // A subsequent account/session has no pending browser attribution to claim.
    rpc.mockClear();
    expect((await complete(request())).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts the database's immutable existing-sponsor result and consumes the cookie", async () => {
    f.values.set(pendingReferralCookie, second);
    rpc.mockResolvedValueOnce({ data: [distributor(second)], error: null });
    rpc.mockResolvedValueOnce({
      data: "Your existing verified sponsor remains linked.",
      error: null,
    });
    const response = await complete(request());
    expect((await response.json()).message).toBe(
      "Your existing verified sponsor remains linked.",
    );
    expect(f.values.has(pendingReferralCookie)).toBe(false);
  });
  it("clears a now-invalid/self referral rejected atomically by the database", async () => {
    f.values.set(pendingReferralCookie, first);
    rpc.mockResolvedValueOnce({ data: [distributor(first)], error: null });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid referring distributor" },
    });
    expect((await (await complete(request())).json()).state).toBe("invalid");
    expect(f.values.has(pendingReferralCookie)).toBe(false);
  });
  it("retains pending data on a claim failure and can retry without a new selection", async () => {
    f.values.set(pendingReferralCookie, first);
    rpc.mockResolvedValueOnce({ data: [distributor(first)], error: null });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private fixture failure" },
    });
    const failed = await complete(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private fixture failure");
    expect(f.values.get(pendingReferralCookie)).toBe(first);
    expect((await (await complete(request())).json()).state).toBe("linked");
    expect(f.values.has(pendingReferralCookie)).toBe(false);
  });
});
