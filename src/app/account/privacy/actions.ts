"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session, staffAccess } from "@/lib/data";
import {
  privacyIntakeSchema,
  privacyUpdateSchema,
  privacyProblem,
} from "@/lib/privacy-requests";
export type PrivacyResult = { message: string; ok?: boolean; id?: string };
function refresh(id?: string) {
  revalidatePath("/account/privacy");
  revalidatePath("/admin/privacy");
  if (id) {
    revalidatePath(`/account/privacy/${id}`);
    revalidatePath(`/admin/privacy/${id}`);
  }
}
export async function submitPrivacyRequest(
  _: PrivacyResult,
  form: FormData,
): Promise<PrivacyResult> {
  try {
    const { client, user } = await session();
    if (!user) return { message: "Sign in to submit a privacy request." };
    const input = privacyIntakeSchema.safeParse(Object.fromEntries(form));
    if (!input.success)
      return {
        message:
          "Choose a market and request type, and enter 20–2000 characters.",
      };
    const { data, error } = await client.rpc("create_privacy_request", {
      p_market: input.data.market,
      p_kind: input.data.kind,
      p_details: input.data.details,
    });
    if (error) return { message: privacyProblem(error.code) };
    if (!z.uuid().safeParse(data).success)
      return {
        message:
          "The request could not be confirmed. Reload before submitting again.",
      };
    refresh(data);
    return {
      ok: true,
      id: data,
      message:
        "Your request is recorded. Open it below to follow its progress.",
    };
  } catch {
    return { message: privacyProblem() };
  }
}
export async function updatePrivacyRequest(
  _: PrivacyResult,
  form: FormData,
): Promise<PrivacyResult> {
  try {
    const { client, user } = await session();
    if (!user) return { message: "Sign in to update this request." };
    const input = privacyUpdateSchema.safeParse(Object.fromEntries(form));
    if (!input.success)
      return {
        message: input.error.issues[0]?.message ?? "Check the request.",
      };
    const v = input.data;
    if (v.operation === "withdraw" && form.get("confirmed") !== "on")
      return { message: "Confirm that you want to withdraw this request." };
    if (v.operation === "review") {
      const access = await staffAccess();
      if (!access.allowed || !access.mfa || access.user?.id !== user.id)
        return {
          message: "Staff access and second-step verification are required.",
        };
    }
    const { data, error } = await client.rpc("update_privacy_request", {
      p_id: v.id,
      p_revision: v.revision,
      p_operation: v.operation,
      p_status: v.operation === "review" ? v.status : null,
      p_message: v.message.trim() || null,
      p_verification: v.operation === "review" ? v.verification || null : null,
      p_reference: v.operation === "review" ? v.reference || null : null,
    });
    if (error) return { message: privacyProblem(error.code) };
    if (data !== v.revision + 1)
      return {
        message:
          "The update could not be confirmed. Reload before trying again.",
      };
    refresh(v.id);
    return {
      ok: true,
      message:
        v.operation === "withdraw" ? "Request withdrawn." : "Request updated.",
    };
  } catch {
    return { message: privacyProblem() };
  }
}
