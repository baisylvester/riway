import { beforeEach, describe, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({
  session: vi.fn(),
  choose: vi.fn(),
  config: vi.fn(),
  market: vi.fn(),
}));
vi.mock("@/lib/data", () => ({ session: f.session, currentMarket: f.market }));
vi.mock("@/services/approved-content-assistant", () => ({
  chooseApprovedSources: f.choose,
  assistantConfiguration: f.config,
}));
import { POST } from "@/app/api/assistant/route";
import { GET as exportData } from "@/app/api/account/export/route";
const id = "70000000-0000-4000-8000-000000000001";
const user = "70000000-0000-4000-8000-000000000002";
const req = (body: unknown, origin = "https://riway.example.invalid") =>
  new Request("https://riway.example.invalid/api/assistant", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
let query: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
};
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id, status: "paid", payment_status: "paid" },
      error: null,
    }),
  };
  rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  f.session.mockResolvedValue({
    user: { id: user },
    client: { from: vi.fn(() => query), rpc },
  });
  f.config.mockReturnValue({ enabled: true });
  f.market.mockResolvedValue("PH");
});
describe("assistant HTTP authorization", () => {
  it("requires same origin, bounded input, consent and authentication", async () => {
    expect(
      (await POST(req({ mode: "order", orderId: id }, "https://evil.invalid")))
        .status,
    ).toBe(403);
    expect(
      (await POST(req({ mode: "knowledge", question: "package label" })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          req({ mode: "knowledge", question: "a".repeat(2500), consent: true }),
        )
      ).status,
    ).toBe(413);
    f.session.mockResolvedValue({ user: null });
    expect((await POST(req({ mode: "order", orderId: id }))).status).toBe(401);
  });
  it("checks order ownership independently and never calls the AI provider for orders", async () => {
    const r = await POST(req({ mode: "order", orderId: id }));
    expect(r.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", user);
    expect(f.choose).not.toHaveBeenCalled();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(req({ mode: "order", orderId: id }))).status).toBe(404);
  });
  it("hands medical questions and unmatched content to support without an AI answer", async () => {
    const r = await POST(
      req({
        mode: "knowledge",
        question: "Will this cure cancer?",
        consent: true,
      }),
    );
    expect(r.status).toBe(200);
    expect((await r.json()).sources).toEqual([]);
    expect(f.choose).not.toHaveBeenCalled();
    const unmatched = await POST(
      req({ mode: "knowledge", question: "unmatched query", consent: true }),
    );
    expect((await unmatched.json()).handoff).toBe("/support");
    expect(f.choose).not.toHaveBeenCalled();
  });
  it("exports only the current account and refuses a mismatched subject response", async () => {
    rpc.mockResolvedValue({ data: { subjectId: user }, error: null });
    const r = await exportData();
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("content-disposition")).toContain("attachment");
    expect(rpc).toHaveBeenCalledWith("export_my_data");
    rpc.mockResolvedValue({ data: { subjectId: id }, error: null });
    expect((await exportData()).status).toBe(503);
  });
});
