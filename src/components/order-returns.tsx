import Link from "next/link";
import { session } from "@/lib/data";
import { money } from "@/lib/domain";
import { returnContextSchema, type ReturnContext } from "@/lib/order-returns";
import { StaffActionForm } from "./staff-action-form";
import { requestReturn } from "@/app/account/orders/return-actions";
import {
  approveRefund,
  receiveReturnedStock,
  resolveCase,
  manageRefund,
} from "@/app/admin/returns/actions";

export const refundPhaseLabels: Record<string, string> = {
  approved: "Approved, awaiting dispatch",
  processing: "Reconciling with payment provider",
  pending: "Processing at payment provider",
  succeeded: "Processed by payment provider",
  failed: "Failed at payment provider",
  review: "Provider reconciliation required",
  cancelled: "Cancelled before dispatch",
};
function RefundReview({
  data,
  caseId,
}: {
  data: ReturnContext;
  caseId: string;
}) {
  if (!data.policy)
    return (
      <p>
        An approved policy is required. Legacy orders need review of their
        original Terms of Sale.
      </p>
    );
  return (
    <details className="panel">
      <summary>Approve full or partial refund</summary>
      <p className="content-body">
        Policy {data.policy.version}: {data.policy.terms}
      </p>
      <p>
        Apply the original sale terms and check merchant/channel capabilities.
        Refund amounts below are currency amounts, with up to two decimal
        places. Use a unique authorization reference per order; reuse it only
        for an exact retry.
      </p>
      <StaffActionForm action={approveRefund} submit="Approve refund amounts">
        <input name="orderId" type="hidden" value={data.orderId} />
        <input name="caseId" type="hidden" value={caseId} />
        <input name="policyId" type="hidden" value={data.policy.id} />
        {data.items
          .filter((i) => i.remainingMinor > 0)
          .map((i) => (
            <label key={i.id}>
              {i.name} · Remaining {money(i.remainingMinor, data.currency)}
              <input
                name={`amount_${i.id}`}
                type="number"
                step="0.01"
                min="0"
                max={(i.remainingMinor / 100).toFixed(2)}
                defaultValue="0"
                required
              />
            </label>
          ))}
        <label>
          Refund authorization reference
          <input name="reference" minLength={5} maxLength={200} required />
        </label>
        <label className="check">
          <input name="confirmed" type="checkbox" required />I verified
          eligibility, original terms, line amounts and merchant capability
          under this approved policy.
        </label>
      </StaffActionForm>
    </details>
  );
}
export async function OrderReturns({
  orderId,
  staff = false,
}: {
  orderId: string;
  staff?: boolean;
}) {
  const { client } = await session();
  const response = await client.rpc("return_context", { p_order: orderId });
  const parsed = returnContextSchema.safeParse(response.data);
  if (response.error || !parsed.success) return null;
  const data = parsed.data;
  return (
    <section className="stack" aria-label="Returns and refunds">
      <h3>Returns and refunds</h3>
      <p>
        Refunds processed by the payment provider:{" "}
        {money(data.refundedMinor, data.currency)}. Available for approval:{" "}
        {money(data.remainingMinor, data.currency)}. A request or approval does
        not itself refund money. Posting to your account depends on the original
        payment channel.
      </p>
      {staff && data.refundedMinor > 0 && (
        <p className="notice">
          Verify the corresponding membership and volume adjustments with RIWAY.
          Partial-refund adjustments are not automatically delivered to RIWAY;
          retain the reconciliation evidence.
        </p>
      )}
      {!staff &&
        !data.cases.some((c) => ["open", "in_review"].includes(c.status)) &&
        data.remainingMinor > 0 && (
          <details>
            <summary>Request a return, refund or paid cancellation</summary>
            <StaffActionForm
              action={requestReturn}
              submit="Submit request for review"
            >
              <input name="orderId" type="hidden" value={orderId} />
              <label>
                Request type
                <select name="kind">
                  <option value="return">Return goods</option>
                  <option value="refund">Refund review</option>
                  <option value="paid_cancellation">Cancel a paid order</option>
                </select>
              </label>
              <label>
                Reason
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                />
              </label>
              <label className="check">
                <input name="confirmed" type="checkbox" required />I request
                review under the applicable Terms of Sale.
              </label>
            </StaffActionForm>
          </details>
        )}
      {data.cases.map((c) => (
        <article className="panel stack" key={c.id}>
          <h4>
            Case {c.id.slice(0, 8).toUpperCase()} · {c.status}
          </h4>
          <p>
            {c.kind.replaceAll("_", " ")}: {c.reason}
          </p>
          {c.resolution && <p className="notice">{c.resolution}</p>}
          {data.refunds
            .filter((r) => r.caseId === c.id)
            .map((r) => (
              <div className="panel" key={r.id}>
                <p>
                  {money(r.amountMinor, data.currency)} ·{" "}
                  {refundPhaseLabels[r.phase] ?? r.phase}
                </p>
                <p>Refund reference: {r.id}</p>
                {staff &&
                  data.canApprove &&
                  ["approved", "processing", "pending", "review"].includes(
                    r.phase,
                  ) && (
                    <details>
                      <summary>Refund management</summary>
                      <StaffActionForm
                        action={manageRefund}
                        submit="Record refund management"
                      >
                        <input name="id" type="hidden" value={r.id} />
                        <label>
                          Action
                          <select name="action">
                            <option value="reconcile">
                              Verify a provider refund ID
                            </option>
                            <option value="cancel">
                              Cancel before first dispatch
                            </option>
                          </select>
                        </label>
                        <label>
                          Provider refund ID
                          <input name="providerId" maxLength={160} />
                        </label>
                        <label className="check">
                          <input name="confirmed" type="checkbox" required />I
                          checked the original merchant account and confirm this
                          action.
                        </label>
                      </StaffActionForm>
                    </details>
                  )}
              </div>
            ))}
          {staff &&
            data.canApprove &&
            ["open", "in_review"].includes(c.status) &&
            data.remainingMinor > 0 && (
              <RefundReview data={data} caseId={c.id} />
            )}
          {staff && data.canReceive && (
            <details>
              <summary>Record physical goods received</summary>
              <p>
                Refunds never restock automatically. Record only confirmed goods
                received or verified unshipped goods retained; include bonus
                goods. Quarantined/discarded goods do not enter sellable
                inventory.
              </p>
              <StaffActionForm
                action={receiveReturnedStock}
                submit="Record goods receipt"
              >
                <input name="caseId" type="hidden" value={c.id} />
                <label>
                  Physical product
                  <select name="productId" required>
                    {data.goods
                      .filter((g) => g.quantity > g.received)
                      .map((g) => (
                        <option key={g.productId} value={g.productId}>
                          {g.name} · {g.quantity - g.received} unreceived
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Quantity received
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={100000}
                    required
                  />
                </label>
                <label>
                  Disposition
                  <select name="disposition">
                    <option value="quarantine">Quarantine</option>
                    <option value="restock">Restock sellable goods</option>
                    <option value="discard">Discard</option>
                  </select>
                </label>
                <label>
                  Unique receipt reference
                  <input
                    name="reference"
                    minLength={5}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="check">
                  <input name="confirmed" type="checkbox" required />I verified
                  the physical quantity and approved disposition.
                </label>
              </StaffActionForm>
            </details>
          )}
          {staff &&
            data.canApprove &&
            ["open", "in_review"].includes(c.status) && (
              <details>
                <summary>Resolve this case</summary>
                <StaffActionForm
                  action={resolveCase}
                  submit="Record case resolution"
                >
                  <input name="caseId" type="hidden" value={c.id} />
                  <input name="revision" type="hidden" value={c.revision} />
                  <label>
                    Decision
                    <select name="decision">
                      <option value="closed">Close completed case</option>
                      <option value="rejected">Reject request</option>
                    </select>
                  </label>
                  <label>
                    Customer-facing explanation
                    <textarea
                      name="note"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <label className="check">
                    <input name="confirmed" type="checkbox" required />I checked
                    all refunds and confirm this case resolution.
                  </label>
                </StaffActionForm>
              </details>
            )}
        </article>
      ))}
      <Link href="/legal/terms-of-sale">Terms of Sale</Link>
      <Link href="/support">Contact RIWAY support</Link>
    </section>
  );
}
