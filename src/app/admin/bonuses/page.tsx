import Link from "next/link";
import { z } from "zod";
import { currentMarket, session } from "@/lib/data";
import { StaffActionForm } from "@/components/staff-action-form";
import { approveBonus, withdrawBonus } from "./actions";
export const metadata = { title: "Bonus campaigns" };
const campaignsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    qualifying_product_id: z.uuid(),
    bonus_product_id: z.uuid(),
    minimum_quantity: z.number(),
    bonus_quantity: z.number(),
    maximum_per_order: z.number(),
    maximum_units: z.number(),
    allocated_units: z.number(),
    starts_at: z.string(),
    ends_at: z.string(),
    return_terms: z.string(),
    withdrawn_at: z.string().nullable(),
  }),
);
export default async function BonusCampaigns({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .catch(0)
    .parse(query.page ?? 0);
  const market = await currentMarket();
  const { client } = await session();
  const response = await client.rpc("staff_bonus_campaigns", {
    p_market: market,
    p_page: page,
  });
  const campaigns = campaignsSchema.safeParse(response.data);
  return (
    <div className="stack">
      <h1>Bonus-item campaigns</h1>
      <p>
        Approve only documented RIWAY campaigns. Rules are immutable; withdraw
        and approve a replacement to change them. One active campaign per market
        and qualifying product is supported.
      </p>
      <p>
        Each qualifying quantity earns the configured bonus quantity, capped per
        order. An award is included only when its entire quantity fits remaining
        campaign capacity. Goods count toward combined market quantity and stock
        limits. Paid allocations remain consumed after refunds; unpaid
        cancellation/expiry releases them. Financial returns/refunds remain a
        separate workflow.
      </p>
      <details className="panel">
        <summary>Approve a campaign</summary>
        <StaffActionForm action={approveBonus} submit="Approve bonus campaign">
          <input name="market" type="hidden" value={market} />
          <label>
            Name
            <input name="name" required minLength={3} maxLength={120} />
          </label>
          <label>
            Qualifying product ID
            <input name="qualifyingProductId" required />
          </label>
          <label>
            Minimum qualifying quantity
            <input
              name="minimumQuantity"
              type="number"
              min={1}
              max={24}
              required
            />
          </label>
          <label>
            Bonus physical product ID
            <input name="bonusProductId" required />
          </label>
          <label>
            Bonus quantity per qualifying quantity
            <input
              name="bonusQuantity"
              type="number"
              min={1}
              max={24}
              required
            />
          </label>
          <label>
            Maximum bonus units per order
            <input
              name="maximumPerOrder"
              type="number"
              min={1}
              max={24}
              required
            />
          </label>
          <label>
            Maximum campaign bonus units
            <input
              name="maximumUnits"
              type="number"
              min={1}
              max={10000000}
              required
            />
          </label>
          <label>
            Start timestamp (UTC ISO 8601)
            <input
              name="startsAt"
              placeholder="YYYY-MM-DDTHH:mm:ssZ"
              required
            />
          </label>
          <label>
            End timestamp (UTC ISO 8601)
            <input name="endsAt" placeholder="YYYY-MM-DDTHH:mm:ssZ" required />
          </label>
          <label className="check">
            <input type="checkbox" name="allowVoucher" />
            The approved campaign permits combining with a voucher.
          </label>
          <label>
            Approved return terms
            <textarea
              name="returnTerms"
              minLength={20}
              maxLength={2000}
              required
            />
          </label>
          <label>
            Approval reference
            <input name="reference" minLength={5} maxLength={200} required />
          </label>
          <label className="check">
            <input name="capacityApproved" type="checkbox" required />I approve
            retaining paid campaign allocations after refunds.
          </label>
          <label className="check">
            <input name="confirmed" type="checkbox" required />I approve these
            exact quantities, dates, combination, allocation and return rules
            for this market.
          </label>
        </StaffActionForm>
      </details>
      {response.error || !campaigns.success ? (
        <p role="status">Campaigns are unavailable for this role.</p>
      ) : (
        campaigns.data.map((c) => (
          <article className="panel stack" key={c.id}>
            <h2>{c.name}</h2>
            <p>
              {c.withdrawn_at ? "Withdrawn" : "Approved"} · {c.allocated_units}{" "}
              / {c.maximum_units} units allocated
            </p>
            <p>
              Qualifier {c.qualifying_product_id} × {c.minimum_quantity}; bonus{" "}
              {c.bonus_product_id} × {c.bonus_quantity}; maximum{" "}
              {c.maximum_per_order} per order.
            </p>
            <p>
              {c.starts_at} – {c.ends_at}
            </p>
            <p>{c.return_terms}</p>
            {!c.withdrawn_at && (
              <StaffActionForm
                action={withdrawBonus}
                submit="Withdraw bonus campaign"
              >
                <input name="id" type="hidden" value={c.id} />
                <label>
                  Withdrawal reference
                  <input
                    name="reference"
                    minLength={5}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="check">
                  <input name="confirmed" type="checkbox" required />
                  Confirm withdrawal from future quotes.
                </label>
              </StaffActionForm>
            )}
          </article>
        ))
      )}
      <nav aria-label="Campaign pages">
        {page > 0 && <Link href={`?page=${page - 1}`}>Previous campaigns</Link>}
        {campaigns.success && campaigns.data.length === 25 && (
          <Link href={`?page=${page + 1}`}>Next campaigns</Link>
        )}
      </nav>
    </div>
  );
}
