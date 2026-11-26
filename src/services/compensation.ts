import "server-only";
import { z } from "zod";
import { ProviderNotConfigured } from "./production-integrations";
import { bonusItemsSchema } from "@/lib/bonus-campaigns";

/**
 * RIWAY compensation order-volume delivery (audit G02).
 *
 * RIWAY calculates and pays every bonus. This module only delivers frozen
 * order facts queued by private.enqueue_compensation_event. No RIWAY endpoint,
 * field mapping, authentication scheme or acknowledgement format has been
 * supplied, so there is deliberately no concrete HTTP adapter: the factory
 * stays fail-closed until the approved contract is implemented behind
 * CompensationVolumeAdapter.
 */

const line = z.object({
  productId: z.uuid(),
  name: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(24),
  unitMinor: z.number().int().positive(),
  discountMinor: z.number().int().nonnegative(),
  netMinor: z.number().int().nonnegative(),
  packageOfferId: z.uuid().nullable(),
});

export const compensationPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  bonusItems: bonusItemsSchema.optional(),
  eventType: z.enum(["order_paid", "order_reversed"]),
  orderId: z.uuid(),
  market: z.enum(["PH", "SG", "MY"]),
  currency: z.enum(["PHP", "SGD", "MYR"]),
  placedAt: z.string().min(10).max(40),
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().positive(),
  sponsorMemberId: z.string().min(1).max(128),
  customerMemberId: z.string().min(1).max(128).nullable(),
  lines: z.array(line).min(1).max(30),
});
export type CompensationPayload = z.infer<typeof compensationPayloadSchema>;

export const claimedCompensationEventSchema = z.object({
  id: z.uuid(),
  lease: z.uuid(),
  eventType: z.enum(["order_paid", "order_reversed"]),
  externalReference: z
    .string()
    .regex(/^riway-web:order:[0-9a-f-]{36}:(paid|reversed)$/),
  attempts: z.number().int().positive(),
  payload: z.unknown(),
});
export type ClaimedCompensationEvent = z.infer<
  typeof claimedCompensationEventSchema
>;

export class CompensationDeliveryError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly code: string,
  ) {
    super("Compensation delivery failed.");
  }
}

export interface CompensationVolumeAdapter {
  /** Must be idempotent on externalReference and resolve only on RIWAY acknowledgement. */
  submit(input: {
    externalReference: string;
    payload: CompensationPayload;
  }): Promise<{ acknowledgementReference: string }>;
}

export function compensationAdapter(
  env: Record<string, string | undefined> = process.env,
): CompensationVolumeAdapter | null {
  const provider = env.COMPENSATION_PROVIDER || "disabled";
  if (provider === "disabled") return null;
  if (provider === "riway")
    // Replace with the RIWAY adapter once the API contract is approved.
    throw new ProviderNotConfigured("RIWAY compensation API contract");
  throw new ProviderNotConfigured(`Compensation provider "${provider}"`);
}

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;

export async function deliverCompensationBatch(
  rpc: Rpc,
  adapter: CompensationVolumeAdapter,
  limit = 10,
) {
  const claimed = await rpc("claim_compensation_events", { p_limit: limit });
  if (claimed.error || !Array.isArray(claimed.data))
    throw new Error("Compensation queue is unavailable.");
  let acknowledged = 0,
    retried = 0,
    rejected = 0,
    persistenceFailures = 0;
  for (const raw of claimed.data) {
    const event = claimedCompensationEventSchema.safeParse(raw);
    if (!event.success) {
      persistenceFailures++;
      continue;
    }
    let result: "acknowledged" | "retry" | "rejected" = "retry",
      reference: string | null = null,
      code: string | null = null;
    const payload = compensationPayloadSchema.safeParse(event.data.payload);
    if (
      !payload.success ||
      payload.data.eventType !== event.data.eventType ||
      event.data.externalReference !==
        `riway-web:order:${payload.data.orderId}:${payload.data.eventType === "order_paid" ? "paid" : "reversed"}`
    ) {
      // A malformed snapshot will not improve on retry; staff review it.
      result = "rejected";
      code = "invalid_payload";
    } else
      try {
        const ack = await adapter.submit({
          externalReference: event.data.externalReference,
          payload: payload.data,
        });
        const ackReference = z
          .string()
          .trim()
          .min(1)
          .max(200)
          .safeParse(ack?.acknowledgementReference);
        if (ackReference.success) {
          result = "acknowledged";
          reference = ackReference.data;
        } else code = "missing_acknowledgement";
      } catch (error) {
        if (error instanceof CompensationDeliveryError) {
          result = error.retryable ? "retry" : "rejected";
          code = /^[a-z0-9_]{1,64}$/.test(error.code)
            ? error.code
            : "provider_error";
        } else code = "provider_unavailable";
      }
    const finished = await rpc("finish_compensation_event", {
      p_id: event.data.id,
      p_token: event.data.lease,
      p_result: result,
      p_reference: reference,
      p_error: code,
    });
    if (finished.error || finished.data !== true) persistenceFailures++;
    else if (result === "acknowledged") acknowledged++;
    else if (result === "retry") retried++;
    else rejected++;
  }
  return {
    processed: claimed.data.length,
    acknowledged,
    retried,
    rejected,
    persistenceFailures,
  };
}
