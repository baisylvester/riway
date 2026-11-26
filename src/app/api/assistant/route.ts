import { session, currentMarket } from "@/lib/data";
import { sameOrigin, failure } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import {
  assistantRequestSchema,
  assistantSourceSchema,
  restrictedQuestion,
  selectCandidates,
} from "@/lib/product-assistant";
import {
  assistantConfiguration,
  chooseApprovedSources,
} from "@/services/approved-content-assistant";
const reply = (message: string, sources: unknown[] = []) =>
  Response.json(
    { message, sources, handoff: "/support" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
export async function POST(request: Request) {
  if (!sameOrigin(request)) return failure("Invalid request origin.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return failure("JSON required.", 415);
  let body: string;
  try {
    body = await limitedText(request, 2000);
  } catch {
    return failure("Question is too long.", 413);
  }
  const parsed = assistantRequestSchema.safeParse(
    (() => {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) return failure("Check the question and consent.");
  const { client, user } = await session();
  if (!user) return failure("Sign in to use the assistant.", 401);
  const v = parsed.data;
  if (v.mode === "order") {
    const { data, error } = await client
      .from("orders")
      .select("id,status,payment_status,created_at")
      .eq("id", v.orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return failure("Order support is unavailable.", 503);
    if (!data) return failure("Order unavailable.", 404);
    return reply(
      `Your order is ${data.status.replaceAll("_", " ")}. Payment status: ${data.payment_status}. Open the order for current delivery and collection details.`,
      [
        {
          id: data.id,
          title: "Your order",
          text: "Order details are retrieved directly from your account and are not sent to an AI provider.",
          url: `/account/orders/${data.id}`,
        },
      ],
    );
  }
  if (restrictedQuestion(v.question))
    return reply(
      "I can help with approved product information and orders, but cannot give medical advice or therapeutic recommendations. Please consult a qualified healthcare professional for health questions. RIWAY support can help with approved product labels.",
    );
  if (!assistantConfiguration().enabled)
    return failure(
      "The product assistant is awaiting provider configuration. Please contact RIWAY support.",
      503,
    );
  const { data, error } = await client.rpc("assistant_sources", {
    p_market: await currentMarket(),
    p_locale: "en",
  });
  if (error)
    return failure(
      "The assistant is unavailable or the request limit was reached. Please try later.",
      429,
    );
  const result = assistantSourceSchema.array().safeParse(data);
  if (!result.success)
    return failure("Approved information is unavailable.", 503);
  const candidates = selectCandidates(v.question, result.data);
  if (!candidates.sources.length)
    return reply(
      "I could not find approved information for this question. Please contact RIWAY support.",
    );
  try {
    const selected = await chooseApprovedSources(
      candidates.sources,
      candidates.terms,
    );
    return reply(
      selected.length
        ? "Here are the relevant passages from RIWAY-approved information. These are not medical advice or a guarantee of results."
        : "I could not confirm an approved answer. Please contact RIWAY support.",
      selected,
    );
  } catch {
    return failure(
      "The assistant could not confirm an answer. Please try again or contact RIWAY support.",
      503,
    );
  }
}
