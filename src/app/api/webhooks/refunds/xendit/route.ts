import { z } from "zod";
import { failure } from "@/lib/http";
import { limitedText } from "@/lib/request-body";
import { xenditClients, verifyCallbackToken } from "@/services/xendit-payments";
import {
  refundJobSchema,
  reconcileRefundJob,
  xenditRefundResolver,
} from "@/services/order-refunds";
export async function POST(request: Request) {
  let clients;
  try {
    clients = xenditClients();
  } catch {
    return failure("Refund callback is not configured.", 503);
  }
  if (
    !verifyCallbackToken(
      request.headers.get("x-callback-token"),
      clients.config.webhookToken,
    )
  )
    return failure("Invalid callback token.", 401);
  const body = z
    .object({
      event: z.string().max(80),
      data: z.record(z.string(), z.unknown()),
    })
    .safeParse(
      await limitedText(request, 65536)
        .then(JSON.parse)
        .catch(() => null),
    );
  if (!body.success) return failure("Invalid refund callback.", 400);
  if (!["refund.succeeded", "refund.failed"].includes(body.data.event))
    return Response.json({ received: true, ignored: true });
  const data = body.data.data;
  const id = z
    .string()
    .regex(/^rfd-[0-9a-f-]{36}$/)
    .safeParse(data.refund_id ?? data.id);
  const reference = z
    .string()
    .regex(/^riway-refund:[0-9a-f-]{36}$/)
    .safeParse(data.reference_id);
  if (!id.success || !reference.success)
    return failure("Refund identifiers are invalid.", 400);
  const local = z
    .uuid()
    .safeParse(reference.data.slice("riway-refund:".length));
  if (!local.success) return failure("Invalid refund reference.", 400);
  try {
    const r = await clients.database.rpc("order_refund_job", {
      p_id: local.data,
    });
    if (r.error) throw Error();
    if (!r.data) return Response.json({ received: true, ignored: true });
    const job = refundJobSchema.parse(r.data);
    await reconcileRefundJob(
      { ...job, providerRefundId: id.data, firstSubmission: false },
      (n, a) => clients.database.rpc(n, a),
      xenditRefundResolver(clients),
    );
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("Refund callback could not be reconciled.", 503);
  }
}
