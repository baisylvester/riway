import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  privacyIntakeSchema,
  privacyUpdateSchema,
  privacyPage,
} from "@/lib/privacy-requests";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: vi.fn(),
  staffAccess: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/data", () => ({
  session: mocks.session,
  staffAccess: mocks.staffAccess,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const { submitPrivacyRequest, updatePrivacyRequest } =
  await import("@/app/account/privacy/actions");
const { PrivacyRequestDetail, PrivacyPagination } =
  await import("@/components/privacy-requests");
const id = "10000000-0000-4000-8000-000000000001";
const form = (values: Record<string, string>) => {
  const f = new FormData();
  Object.entries(values).forEach(([k, v]) => f.set(k, v));
  return f;
};
const update = (values: Record<string, string> = {}) =>
  form({
    id,
    revision: "2",
    operation: "message",
    message: "Please include all of my orders.",
    ...values,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: "owner" },
    client: { rpc: mocks.rpc },
  });
  mocks.staffAccess.mockResolvedValue({
    user: { id: "owner" },
    allowed: true,
    mfa: true,
  });
  mocks.rpc.mockResolvedValue({ data: 3, error: null });
});
describe("privacy input boundaries", () => {
  it("accepts each supported request type", () => {
    for (const kind of ["access", "correction", "erasure", "restriction"])
      expect(
        privacyIntakeSchema.parse({
          kind,
          market: "PH",
          details: " Please provide my account information. ",
        }).details,
      ).toBe("Please provide my account information.");
  });
  it.each([
    {
      market: "US",
      kind: "access",
      details: "Please provide my account information.",
    },
    {
      market: "PH",
      kind: "refund",
      details: "Please provide my account information.",
    },
    { market: "PH", kind: "access", details: "Too short" },
    { market: "PH", kind: "access", details: "x".repeat(2001) },
    {
      market: "PH",
      kind: "access",
      details: "Please provide\u0001 my account information.",
    },
  ])("rejects invalid intake %j", (input) => {
    expect(privacyIntakeSchema.safeParse(input).success).toBe(false);
  });
  it("requires resolution references on terminal staff decisions", () => {
    expect(
      privacyUpdateSchema.safeParse({
        id,
        revision: 2,
        operation: "review",
        status: "completed",
        message: "Approved processing complete.",
      }).success,
    ).toBe(false);
    expect(
      privacyUpdateSchema.safeParse({
        id,
        revision: 2,
        operation: "review",
        status: "completed",
        message: "Approved processing complete.",
        reference: "CASE-1",
      }).success,
    ).toBe(true);
  });
  it("rejects control characters in internal references", () => {
    expect(
      privacyUpdateSchema.safeParse({
        id,
        revision: 2,
        operation: "review",
        status: "in_review",
        message: "We are reviewing the request.",
        verification: "VERIFY\n1",
      }).success,
    ).toBe(false);
  });
  it("bounds pagination and rejects arrays and invalid page text", () => {
    for (const value of [undefined, "-1", "1x", "1000001", ["1"]])
      expect(privacyPage(value)).toBe(0);
    expect(privacyPage("2")).toBe(2);
  });
});
describe("privacy server actions", () => {
  it("derives the caller from the session, not submitted identity", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: id, error: null });
    const result = await submitPrivacyRequest(
      { message: "" },
      form({
        market: "PH",
        kind: "access",
        details: "Please provide my account information.",
        user_id: "victim",
      }),
    );
    expect(result).toMatchObject({ ok: true, id });
    expect(mocks.rpc).toHaveBeenCalledWith("create_privacy_request", {
      p_market: "PH",
      p_kind: "access",
      p_details: "Please provide my account information.",
    });
  });
  it("requires sign-in before any RPC", async () => {
    mocks.session.mockResolvedValueOnce({ user: null });
    expect(
      (await updatePrivacyRequest({ message: "" }, update())).ok,
    ).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid intake before RPC", async () => {
    expect(
      (
        await submitPrivacyRequest(
          { message: "" },
          form({ market: "PH", kind: "access", details: "short" }),
        )
      ).ok,
    ).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("strips forged staff-only fields from a customer message", async () => {
    expect(
      (
        await updatePrivacyRequest(
          { message: "" },
          update({
            status: "completed",
            verification: "FORGED",
            reference: "FORGED",
          }),
        )
      ).ok,
    ).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("update_privacy_request", {
      p_id: id,
      p_revision: 2,
      p_operation: "message",
      p_status: null,
      p_message: "Please include all of my orders.",
      p_verification: null,
      p_reference: null,
    });
  });
  it.each([
    { user: { id: "owner" }, allowed: true, mfa: false },
    { user: { id: "owner" }, allowed: false, mfa: true },
    { user: { id: "other" }, allowed: true, mfa: true },
  ])("refuses unverified or mismatched staff %j", async (access) => {
    mocks.staffAccess.mockResolvedValueOnce(access);
    expect(
      (
        await updatePrivacyRequest(
          { message: "" },
          update({ operation: "review", status: "in_review" }),
        )
      ).ok,
    ).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes review references only after staff authentication", async () => {
    expect(
      (
        await updatePrivacyRequest(
          { message: "" },
          update({
            operation: "review",
            status: "completed",
            verification: "VERIFY-1",
            reference: "CASE-1",
          }),
        )
      ).ok,
    ).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_privacy_request",
      expect.objectContaining({
        p_operation: "review",
        p_verification: "VERIFY-1",
        p_reference: "CASE-1",
        p_status: "completed",
      }),
    );
  });
  it("requires explicit withdrawal confirmation", async () => {
    expect(
      (
        await updatePrivacyRequest(
          { message: "" },
          update({ operation: "withdraw" }),
        )
      ).ok,
    ).toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(
      (
        await updatePrivacyRequest(
          { message: "" },
          update({ operation: "withdraw", confirmed: "on" }),
        )
      ).ok,
    ).toBe(true);
  });
  it("reports stale edits without claiming success or refreshing", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "internal details" },
    });
    expect(await updatePrivacyRequest({ message: "" }, update())).toEqual({
      message: "This request changed. Reload before continuing.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("does not claim success for a malformed RPC result", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 99, error: null });
    expect(
      (await updatePrivacyRequest({ message: "" }, update())).ok,
    ).toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("handles network errors without leaking backend messages", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("private server configuration"));
    const result = await updatePrivacyRequest({ message: "" }, update());
    expect(result.ok).toBeUndefined();
    expect(result.message).not.toContain("private server");
  });
});
describe("privacy account presentation", () => {
  const request = {
    id,
    kind: "access" as const,
    market: "PH" as const,
    status: "completed" as const,
    revision: 2,
    createdAt: "2026-11-24T00:00:00+00:00",
    updatedAt: "2026-11-24T00:00:00+00:00",
    details: "<img src=x onerror=alert(1)>",
    identityVerified: true,
    totalEvents: 1,
    page: 0,
    events: [
      {
        id,
        byStaff: true,
        status: "completed" as const,
        message: "<script>alert(1)</script>",
        createdAt: "2026-11-24T00:00:00+00:00",
      },
    ],
  };
  it("escapes customer/staff content and hides changes on closed cases", () => {
    const html = renderToStaticMarkup(
      <PrivacyRequestDetail
        request={request}
        href={`/account/privacy/${id}`}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Withdraw request");
    expect(html).not.toContain("Save review");
  });
  it("keeps market and closed filters when moving through queue pages", () => {
    const html = renderToStaticMarkup(
      <PrivacyPagination
        total={28}
        page={0}
        href="/admin/privacy?market=SG&closed=1"
      />,
    );
    expect(html).toContain("market=SG&amp;closed=1&amp;page=1");
    expect(html).not.toContain("Previous page");
  });
});
