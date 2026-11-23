import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { createClient } from "@supabase/supabase-js";
import { failure } from "@/lib/http";
import { NextRequest } from "next/server";
import { limitedText } from "@/lib/request-body";
export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const issuer = process.env.CLERK_ISSUER_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !key || !issuer || !url)
    return failure("Identity webhook is not configured.", 503);
  if (Number(request.headers.get("content-length") || 0) > 65536)
    return failure("Payload too large.", 413);
  let event;
  let body;
  try {
    body = await limitedText(request, 65536);
  } catch {
    return failure("Invalid or oversized payload.", 413);
  }
  try {
    event = await verifyWebhook(
      new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      }),
      { signingSecret: secret },
    );
  } catch {
    return failure("Invalid webhook signature.", 400);
  }
  if (event.type === "user.deleted" && event.data.id) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.rpc("disable_clerk_identity", {
      issuer,
      subject: event.data.id,
    });
    if (error) return failure("Identity event could not be persisted.", 503);
  }
  return Response.json(
    { received: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
