import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  adminSignOut: vi.fn(),
  serviceRpc: vi.fn(),
  getClaims: vi.fn(),
  created: [] as string[],
}));
vi.mock("@/lib/data", () => ({ session: mocks.session }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => {
    mocks.created.push(key);
    return {
      auth: {
        signInWithOtp: mocks.signInWithOtp,
        verifyOtp: mocks.verifyOtp,
        admin: { signOut: mocks.adminSignOut },
      },
      rpc: mocks.serviceRpc,
    };
  },
}));
const { sendEmailCode, verifyEmailCode } =
  await import("@/app/auth/email-code-actions");

const me = {
  id: "70000000-0000-4000-8000-000000000001",
  email: "staff@example.invalid",
};
const sessionId = "80000000-0000-4000-8000-000000000002";
const form = (code?: string) => {
  const f = new FormData();
  if (code !== undefined) f.set("code", code);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.created.length = 0;
  vi.stubEnv("AUTH_PROVIDER", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  mocks.getClaims.mockResolvedValue({
    data: { claims: { session_id: sessionId } },
  });
  mocks.session.mockResolvedValue({
    user: me,
    client: { auth: { getClaims: mocks.getClaims } },
  });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({
    data: { user: { id: me.id }, session: { access_token: "temp-token" } },
    error: null,
  });
  mocks.adminSignOut.mockResolvedValue({ error: null });
  mocks.serviceRpc.mockResolvedValue({
    data: "2026-11-25T00:00:00Z",
    error: null,
  });
});

describe("sendEmailCode", () => {
  it("sends only to the signed-in account's own email and never creates users", async () => {
    const result = await sendEmailCode({ message: "" }, form());
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: me.email,
      options: { shouldCreateUser: false },
    });
    expect(result.ok).toBe(true);
    expect(result.message).not.toContain(me.email);
    expect(mocks.created).toEqual(["publishable"]);
  });
  it("refuses when signed out, under Clerk, and reports rate limits", async () => {
    mocks.session.mockResolvedValueOnce({ user: null, client: {} });
    expect((await sendEmailCode({ message: "" }, form())).ok).toBeUndefined();
    vi.stubEnv("AUTH_PROVIDER", "clerk");
    expect((await sendEmailCode({ message: "" }, form())).ok).toBeUndefined();
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    mocks.signInWithOtp.mockResolvedValueOnce({ error: { status: 429 } });
    expect((await sendEmailCode({ message: "" }, form())).message).toMatch(
      /Wait a minute/,
    );
  });
});

describe("verifyEmailCode", () => {
  it("checks the code for the account email, ends the temporary session and marks only the current session", async () => {
    const result = await verifyEmailCode({ message: "" }, form(" 123456 "));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: me.email,
      token: "123456",
      type: "email",
    });
    expect(mocks.adminSignOut).toHaveBeenCalledWith("temp-token", "local");
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      "record_email_second_factor",
      {
        p_user: me.id,
        p_session: sessionId,
      },
    );
    expect(result).toEqual({ ok: true, message: "Email code verified." });
  });
  it("rejects malformed, wrong or another user's codes without recording anything", async () => {
    for (const code of [undefined, "", "12ab56", "123"])
      expect(
        (await verifyEmailCode({ message: "" }, form(code))).ok,
      ).toBeUndefined();
    mocks.verifyOtp.mockResolvedValueOnce({ data: {}, error: { status: 403 } });
    expect(
      (await verifyEmailCode({ message: "" }, form("123456"))).ok,
    ).toBeUndefined();
    mocks.verifyOtp.mockResolvedValueOnce({
      data: {
        user: { id: "90000000-0000-4000-8000-000000000009" },
        session: null,
      },
      error: null,
    });
    expect(
      (await verifyEmailCode({ message: "" }, form("123456"))).ok,
    ).toBeUndefined();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it("fails closed without a service key or a valid current session id", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(
      (await verifyEmailCode({ message: "" }, form("123456"))).message,
    ).toMatch(/not configured/);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    mocks.getClaims.mockResolvedValueOnce({
      data: { claims: { session_id: "nope" } },
    });
    expect(
      (await verifyEmailCode({ message: "" }, form("123456"))).ok,
    ).toBeUndefined();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
