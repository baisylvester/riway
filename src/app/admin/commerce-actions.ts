"use server";

import { revalidatePath } from "next/cache";
import { session, staffAccess } from "@/lib/data";
import {
  commerceDraftInputSchema,
  commerceDraftRecordSchema,
  type CommerceDraft,
} from "@/lib/commerce-drafts";
import { eventDateSchema } from "@/lib/domain";

export type DraftResult = {
  message: string;
  ok?: boolean;
  saved?: CommerceDraft;
};

function amount(value: FormDataEntryValue | null, optional = false) {
  if (value === "" && optional) return null;
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value)
  )
    return NaN;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function timestamp(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    !value ||
    !eventDateSchema.safeParse(value).success
  )
    return "";
  return new Date(value + "Z").toISOString();
}

export async function saveCommerceDraft(
  _: DraftResult,
  form: FormData,
): Promise<DraftResult> {
  const access = await staffAccess();
  if (!access.allowed || !access.mfa)
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const kind = form.get("kind");
  let definition: unknown;
  if (kind === "package") {
    const count = Number(form.get("componentCount"));
    if (!Number.isInteger(count) || count < 1 || count > 30)
      return { message: "Add between 1 and 30 package components." };
    definition = {
      components: Array.from({ length: count }, (_, i) => ({
        productId: form.get(`componentProduct_${i}`),
        quantity: Number(form.get(`componentQuantity_${i}`)),
      })),
      retailMinor: amount(form.get("retailAmount"), true),
      memberMinor: amount(form.get("memberAmount"), true),
    };
  } else {
    const voucher = form.get("voucherCode");
    definition = {
      productIds: form.getAll("productIds"),
      discountType: form.get("discountType"),
      discountValue: amount(form.get("discountAmount")),
      minimumSubtotalMinor: amount(form.get("minimumSubtotal")),
      maximumDiscountMinor:
        form.get("discountType") === "percent"
          ? amount(form.get("maximumDiscount"), true)
          : null,
      voucherCode:
        typeof voucher === "string" && voucher.trim()
          ? voucher.trim().toUpperCase()
          : null,
      startsAt: timestamp(form.get("startsAt")),
      endsAt: timestamp(form.get("endsAt")),
      audience: form.get("audience"),
      usageLimit:
        form.get("usageLimit") === "" ? null : Number(form.get("usageLimit")),
    };
  }
  if (new TextEncoder().encode(JSON.stringify(definition)).byteLength > 16384)
    return {
      message: "The configuration is too large. Reduce its product selections.",
    };
  const parsed = commerceDraftInputSchema.safeParse({
    draftId: form.get("draftId") || null,
    kind,
    market: form.get("market"),
    name: form.get("name"),
    status: form.get("status"),
    definition,
    expectedRevision: Number(form.get("expectedRevision")),
  });
  if (!parsed.success)
    return {
      message:
        "Check the name, products, amounts and date window. Use at most two decimal places for amounts.",
    };
  const { client } = await session();
  const v = parsed.data;
  const { data, error } = await client.rpc("save_commerce_draft", {
    draft_id: v.draftId,
    k: v.kind,
    m: v.market,
    n: v.name,
    s: v.status,
    d: v.definition,
    expected_revision: v.expectedRevision,
  });
  if (error) {
    if (error.code === "40001")
      return {
        message:
          "A newer version has been saved. Reload this page before editing again.",
      };
    if (["PGRST202", "42883", "42P01"].includes(error.code))
      return { message: "Draft configuration is awaiting database setup." };
    return {
      message:
        "The draft could not be saved. Check your market permissions, authenticator session and product selections.",
    };
  }
  const saved = commerceDraftRecordSchema.safeParse(data);
  if (
    !saved.success ||
    saved.data.kind !== v.kind ||
    saved.data.market !== v.market ||
    saved.data.revision !== v.expectedRevision + 1 ||
    (v.draftId !== null && saved.data.id !== v.draftId)
  )
    return {
      message:
        "The save response could not be verified. Reload before trying again.",
    };
  revalidatePath(`/admin/${v.kind === "package" ? "packages" : "promotions"}`);
  return {
    ok: true,
    message:
      "Draft saved. Review status does not activate prices or discounts.",
    saved: saved.data,
  };
}
