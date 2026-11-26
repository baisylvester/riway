import Link from "@/components/localized-link";
import { z } from "zod";
import { currentMarket, session } from "@/lib/data";
import { refundPolicySchema } from "@/lib/order-returns";
import { StaffActionForm } from "@/components/staff-action-form";
import { OrderReturns } from "@/components/order-returns";
import { approvePolicy, withdrawPolicy } from "./actions";
export const metadata = { title: "Returns and refunds" };
export default async function ReturnsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; order?: string }>;
}) {
  const q = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .catch(0)
    .parse(q.page ?? 0);
  const order = z.uuid().safeParse(q.order);
  const market = await currentMarket();
  const { client } = await session();
  const [listed, p] = await Promise.all([
    client.rpc("staff_return_cases", { p_market: market, p_page: page }),
    client.rpc("staff_refund_policy", { p_market: market }),
  ]);
  const cases = z
    .array(
      z.object({
        id: z.uuid(),
        orderId: z.uuid(),
        kind: z.string(),
        status: z.string(),
        createdAt: z.string(),
      }),
    )
    .safeParse(listed.data);
  const access = z
    .object({ canApprove: z.boolean(), policy: refundPolicySchema.nullable() })
    .safeParse(p.data);
  const policy = {
    success: access.success,
    data: access.success ? access.data.policy : null,
  };
  const canApprove = access.success && access.data.canApprove;
  return (
    <div className="stack">
      <h1>Returns and refunds</h1>
      <p>
        Administrators/compliance approve policies and financial amounts;
        administrators/operations record goods received. Approval reserves
        refundable amounts. Dispatch, verified callbacks and polling determine
        the actual provider result. Credit notes and tax documents require the
        separate finance-document workflow.
      </p>
      {policy.success && policy.data ? (
        <aside className="panel">
          <h2>Current policy · {policy.data.version}</h2>
          <p className="content-body">{policy.data.terms}</p>
          {canApprove && (
            <StaffActionForm
              action={withdrawPolicy}
              submit="Withdraw future policy"
            >
              <input name="id" type="hidden" value={policy.data.id} />
              <label className="check">
                <input name="confirmed" type="checkbox" required />
                Withdraw from future quotes; retain existing order terms.
              </label>
            </StaffActionForm>
          )}
        </aside>
      ) : canApprove ? (
        <details className="panel">
          <summary>Approve market refund policy</summary>
          <StaffActionForm
            action={approvePolicy}
            submit="Approve refund policy"
          >
            <input name="market" type="hidden" value={market} />
            <label>
              Policy version
              <input name="version" minLength={3} maxLength={120} required />
            </label>
            <label>
              Approved customer-facing terms
              <textarea name="terms" minLength={20} maxLength={8000} required />
            </label>
            <label className="check">
              <input name="partial" type="checkbox" />
              This policy permits partial refunds.
            </label>
            <label>
              Approval reference
              <input name="reference" minLength={5} maxLength={200} required />
            </label>
            <label className="check">
              <input name="confirmed" type="checkbox" required />I verified
              RIWAY finance/legal approval and the exact market rules.
            </label>
          </StaffActionForm>
        </details>
      ) : (
        <p>
          Policy approval requires market administrator or compliance access.
        </p>
      )}
      {order.success ? (
        <>
          <Link href="/admin/returns">All return cases</Link>
          <OrderReturns orderId={order.data} staff />
        </>
      ) : listed.error || !cases.success ? (
        <p>Return cases are unavailable for this role.</p>
      ) : (
        cases.data.map((c) => (
          <article className="panel" key={c.id}>
            <h2>
              {c.kind.replaceAll("_", " ")} · {c.status}
            </h2>
            <p>Case {c.id}</p>
            <Link href={`/admin/returns?order=${c.orderId}`}>
              Review order returns and refunds
            </Link>
          </article>
        ))
      )}
      {!order.success && (
        <nav aria-label="Return case pages">
          {page > 0 && <Link href={`?page=${page - 1}`}>Previous cases</Link>}
          {cases.success && cases.data.length === 25 && (
            <Link href={`?page=${page + 1}`}>Next cases</Link>
          )}
        </nav>
      )}
    </div>
  );
}
