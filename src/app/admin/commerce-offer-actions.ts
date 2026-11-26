"use server";

import { revalidatePath } from "@/lib/revalidation";
import { session, staffAccess } from "@/lib/data";
import {
  commerceApprovalInputSchema,
  commerceOfferSchema,
  commerceWithdrawalInputSchema,
  type CommerceOffer,
} from "@/lib/commerce-offers";

export type CommerceOfferResult = {
  message: string;
  ok?: boolean;
  offer?: CommerceOffer;
};

function problem(code: string) {
  if (code === "40001")
    return "This draft has changed. Reload and review its latest version before approving.";
  if (code === "23505")
    return "An approved configuration already exists for this package or voucher. Withdraw it before approving a replacement.";
  if (code === "42501")
    return "Market administrator or compliance access with verified MFA is required.";
  if (["PGRST202", "42883", "42P01"].includes(code))
    return "Checkout approval is awaiting database setup.";
  return "The configuration could not be changed. Check its review status, product selection and market permissions.";
}

function refresh(kind: "package" | "promotion") {
  revalidatePath(`/admin/${kind === "package" ? "packages" : "promotions"}`);
  revalidatePath("/shop");
  revalidatePath("/shop/[slug]", "page");
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function approveCommerceDraft(
  _: CommerceOfferResult,
  form: FormData,
): Promise<CommerceOfferResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa)
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const kind = form.get("kind");
  const parsed = commerceApprovalInputSchema.safeParse({
    kind,
    draftId: form.get("draftId"),
    market: form.get("market"),
    revision: Number(form.get("revision")),
    productId: kind === "promotion" ? null : form.get("productId"),
    reference: form.get("reference"),
    acknowledged: form.get("acknowledged") === "on",
  });
  if (!parsed.success)
    return {
      message:
        "Review the draft, select its package product if needed, enter an approval reference and acknowledge the checkout rules.",
    };
  const input = parsed.data;
  const { client, user } = await session();
  if (!user)
    return { message: "Sign in again before approving a configuration." };
  const { data, error } = await client.rpc("approve_commerce_draft", {
    p_draft: input.draftId,
    p_revision: input.revision,
    p_product: input.productId,
    p_reference: input.reference,
  });
  if (error) return { message: problem(error.code) };
  const offer = commerceOfferSchema.safeParse(data);
  if (
    !offer.success ||
    offer.data.draftId !== input.draftId ||
    offer.data.draftRevision !== input.revision ||
    offer.data.kind !== input.kind ||
    offer.data.market !== input.market ||
    offer.data.productId !== input.productId ||
    offer.data.approvedBy !== user.id ||
    offer.data.withdrawnAt !== null
  )
    return {
      message:
        "The approval response could not be verified. Reload before trying again.",
    };
  refresh(input.kind);
  return {
    ok: true,
    offer: offer.data,
    message:
      "Configuration approved for checkout. Existing market, regulatory and payment gates still apply.",
  };
}

export async function withdrawCommerceOffer(
  _: CommerceOfferResult,
  form: FormData,
): Promise<CommerceOfferResult> {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa)
    return {
      message: "Staff access and authenticator verification are required.",
    };
  const parsed = commerceWithdrawalInputSchema.safeParse({
    offerId: form.get("offerId"),
    kind: form.get("kind"),
    market: form.get("market"),
    reference: form.get("reference"),
    acknowledged: form.get("acknowledged") === "on",
  });
  if (!parsed.success)
    return {
      message:
        "Enter a withdrawal reference or reason and confirm the withdrawal.",
    };
  const { client, user } = await session();
  if (!user)
    return { message: "Sign in again before withdrawing a configuration." };
  const input = parsed.data;
  const { data, error } = await client.rpc("withdraw_commerce_offer", {
    p_offer: input.offerId,
    p_reference: input.reference,
  });
  if (error) return { message: problem(error.code) };
  const offer = commerceOfferSchema.safeParse(data);
  if (
    !offer.success ||
    offer.data.id !== input.offerId ||
    offer.data.kind !== input.kind ||
    offer.data.market !== input.market ||
    !offer.data.withdrawnAt
  )
    return {
      message:
        "The withdrawal response could not be verified. Reload before trying again.",
    };
  refresh(input.kind);
  return {
    ok: true,
    offer: offer.data,
    message:
      "Configuration withdrawn from new checkout attempts. Existing orders retain their recorded configuration.",
  };
}
