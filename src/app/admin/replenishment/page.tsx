import { StaffActionForm } from "@/components/staff-action-form";
import { currentMarket, session } from "@/lib/data";
import { replenishmentRuleList } from "@/lib/replenishment";
import { approveRule, withdrawRule } from "./actions";

export const metadata = { title: "Replenishment rules" };

export default async function ReplenishmentRules() {
  const [market, { client }] = await Promise.all([currentMarket(), session()]);
  const result = await client.rpc("staff_replenishment_rules", {
    p_market: market,
  });
  const rules = replenishmentRuleList.safeParse(result.data);
  return (
    <div className="stack">
      <h1>Replenishment rules · {market}</h1>
      <p>
        Authorize a specific product, interval and terms version for
        customer-approved renewal orders.
      </p>
      {!rules.success ? (
        <p>Market administrator or compliance access is required.</p>
      ) : (
        <>
          {rules.data.products.length > 0 && (
            <details className="panel">
              <summary>Approve a product schedule</summary>
              <StaffActionForm
                action={approveRule}
                submit="Approve schedule terms"
              >
                <input type="hidden" name="market" value={market} />
                <label>
                  Approved product
                  <select name="product" required defaultValue="">
                    <option value="" disabled>
                      Choose a product
                    </option>
                    {rules.data.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Interval in days{" "}
                  <input type="number" name="days" min={1} max={365} required />
                </label>
                <label>
                  Terms version{" "}
                  <input
                    name="version"
                    minLength={3}
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  Approved schedule terms{" "}
                  <textarea
                    name="terms"
                    minLength={20}
                    maxLength={8000}
                    required
                  />
                </label>
                <label>
                  Approval reference{" "}
                  <input
                    name="reference"
                    minLength={5}
                    maxLength={160}
                    required
                  />
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="approved" required /> I verified
                  RIWAY approval for this product, interval and terms.
                </label>
              </StaffActionForm>
            </details>
          )}
          {rules.data.rules.length === 0 && (
            <p>No current schedule rules for this market.</p>
          )}
          {rules.data.rules.map((rule) => (
            <article className="panel stack" key={rule.id}>
              <h2>{rule.product}</h2>
              <p>
                {rule.intervalDays} days · {rule.version} · {rule.reference}
              </p>
              <StaffActionForm
                action={withdrawRule}
                submit="Withdraw schedule terms"
              >
                <input type="hidden" name="rule" value={rule.id} />
                <label className="checkbox">
                  <input type="checkbox" name="confirmed" required /> Close
                  future renewals under these terms.
                </label>
              </StaffActionForm>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
