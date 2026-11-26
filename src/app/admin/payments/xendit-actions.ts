"use server";
import { z } from "zod";
import { revalidatePath } from "@/lib/revalidation";
import { session, staffAccess } from "@/lib/data";
import { marketSchema } from "@/lib/domain";
import { xenditChannels } from "@/lib/xendit-channels";
type Result = { message: string; ok?: boolean };

// Market admins (MFA) record which Xendit account processes a market and
// which channels are switched on. The database enforces the admin role,
// LIVE status for sub-accounts and writes an audit log entry.
export async function saveXenditRouting(
  _: Result,
  f: FormData,
): Promise<Result> {
  const access = await staffAccess();
  if (!access.allowed || !access.mfa)
    return { message: "Market admin access and MFA required." };
  const v = z
    .object({
      market: marketSchema,
      livemode: z.enum(["test", "live"]),
      accountType: z.enum(["MASTER", "OWNED", "MANAGED"]),
      subAccountId: z
        .string()
        .trim()
        .regex(/^([A-Za-z0-9_-]{8,64})?$/),
      accountStatus: z
        .enum([
          "",
          "REGISTERED",
          "AWAITING_DOCS",
          "PENDING_VERIFICATION",
          "AWAITING_RESUBMISSION",
          "LIVE",
          "DECLINED",
          "DORMANT",
          "SUSPENDED",
          "CLOSED",
          "INVITED",
        ])
        .default(""),
      enabled: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries([...f].filter(([k]) => k !== "channels")));
  if (!v.success) return { message: "Check the account fields." };
  const known = new Set(xenditChannels[v.data.market].map((c) => c.code));
  const channels = f.getAll("channels").map(String);
  if (channels.some((c) => !known.has(c)))
    return {
      message: "Only documented channels for this market can be enabled.",
    };
  // RIWAY decision (2026-11-23): live payments use each market's sub-account.
  if (v.data.livemode === "live" && v.data.accountType === "MASTER")
    return {
      message:
        "Live payments must use this market's xenPlatform sub-account, not the master account.",
    };
  if ((v.data.accountType === "MASTER") !== (v.data.subAccountId === ""))
    return {
      message:
        "Use no sub-account ID for the master account, and a sub-account ID for OWNED/MANAGED.",
    };
  const { client } = await session();
  const { error } = await client.rpc("set_xendit_market_account", {
    p_market: v.data.market,
    p_live: v.data.livemode === "live",
    p_type: v.data.accountType,
    p_sub_account: v.data.subAccountId || null,
    p_status: v.data.accountStatus || null,
    p_channels: channels,
    p_enabled: v.data.enabled === "on",
  });
  revalidatePath("/admin/payments");
  return error
    ? {
        message:
          "Save failed. You need the admin role for this market, and a sub-account must be LIVE before payments are enabled.",
      }
    : { message: "Xendit routing saved.", ok: true };
}
