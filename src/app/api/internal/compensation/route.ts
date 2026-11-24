import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { failure } from "@/lib/http";
import {
  compensationAdapter,
  deliverCompensationBatch,
} from "@/services/compensation";

// Service-only worker: delivers queued order-volume events to RIWAY. It
// refuses before claiming anything while the RIWAY contract is not configured,
// so queued events keep their full retry budget for activation.
export async function POST(request: Request) {
  const secret = process.env.COMPENSATION_WORKER_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32 || !url || !key)
    return failure("Compensation worker is not configured.", 503);
  const received = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return failure("Unauthorized", 401);
  let adapter;
  try {
    adapter = compensationAdapter();
  } catch {
    return failure("RIWAY compensation delivery is not configured.", 503);
  }
  if (!adapter) return failure("RIWAY compensation delivery is disabled.", 503);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const result = await deliverCompensationBatch(
      (name, args) => client.rpc(name, args),
      adapter,
    );
    return Response.json(result, {
      status: result.persistenceFailures ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error(JSON.stringify({ event: "compensation_queue_unavailable" }));
    return failure("Compensation queue is unavailable.", 503);
  }
}
