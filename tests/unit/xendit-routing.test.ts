import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  access: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({ staffAccess: f.access, session: f.session }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));
import { saveXenditRouting } from "../../src/app/admin/payments/xendit-actions";

const form = (fields: Record<string, string>, channels: string[] = []) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  for (const c of channels) data.append("channels", c);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  f.access.mockResolvedValue({ allowed: true, mfa: true });
  f.rpc.mockResolvedValue({ data: {}, error: null });
  f.session.mockResolvedValue({ client: { rpc: f.rpc } });
});

describe("xendit routing administration", () => {
  it("refuses live routing to the master account", async () => {
    const r = await saveXenditRouting(
      { message: "" },
      form(
        {
          market: "PH",
          livemode: "live",
          accountType: "MASTER",
          subAccountId: "",
        },
        ["GCASH"],
      ),
    );
    expect(r.message).toMatch(/sub-account/);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("saves a live market sub-account with documented channels", async () => {
    const r = await saveXenditRouting(
      { message: "" },
      form(
        {
          market: "PH",
          livemode: "live",
          accountType: "OWNED",
          subAccountId: "sub_ph_live_01",
          accountStatus: "LIVE",
          enabled: "on",
        },
        ["GCASH", "BPI_ONLINE_BANKING"],
      ),
    );
    expect(r.ok).toBe(true);
    expect(f.rpc).toHaveBeenCalledWith("set_xendit_market_account", {
      p_market: "PH",
      p_live: true,
      p_type: "OWNED",
      p_sub_account: "sub_ph_live_01",
      p_status: "LIVE",
      p_channels: ["GCASH", "BPI_ONLINE_BANKING"],
      p_enabled: true,
    });
  });
  it("allows the master account in test mode only", async () => {
    const r = await saveXenditRouting(
      { message: "" },
      form(
        {
          market: "PH",
          livemode: "test",
          accountType: "MASTER",
          subAccountId: "",
        },
        ["GCASH"],
      ),
    );
    expect(r.ok).toBe(true);
  });
  it("rejects channels not documented for the market and staff without MFA", async () => {
    expect(
      (
        await saveXenditRouting(
          { message: "" },
          form(
            {
              market: "PH",
              livemode: "test",
              accountType: "MASTER",
              subAccountId: "",
            },
            ["CIMB_FPX"],
          ),
        )
      ).message,
    ).toMatch(/documented/);
    f.access.mockResolvedValue({ allowed: true, mfa: false });
    expect(
      (
        await saveXenditRouting(
          { message: "" },
          form({
            market: "PH",
            livemode: "test",
            accountType: "MASTER",
            subAccountId: "",
          }),
        )
      ).message,
    ).toMatch(/MFA/);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
