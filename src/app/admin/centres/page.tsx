import { currentMarket, session } from "@/lib/data";
import { centreSchema, type ServiceCentre } from "@/lib/checkout-fulfilment";
import { StaffActionForm } from "@/components/staff-action-form";
import { saveServiceCentre } from "./actions";
export const metadata = { title: "Service centres" };
function CentreForm({
  centre,
  market,
}: {
  centre?: ServiceCentre;
  market: string;
}) {
  return (
    <StaffActionForm
      action={saveServiceCentre}
      submit="Approve centre revision"
    >
      <input type="hidden" name="id" value={centre?.id ?? ""} />
      <input type="hidden" name="revision" value={centre?.revision ?? 0} />
      <input type="hidden" name="market" value={market} />
      <label>
        Name
        <input
          name="name"
          required
          minLength={3}
          maxLength={120}
          defaultValue={centre?.name}
        />
      </label>
      <label>
        Address
        <input
          name="line1"
          required
          minLength={5}
          maxLength={200}
          defaultValue={centre?.line1}
        />
      </label>
      <label>
        City
        <input
          name="city"
          required
          minLength={2}
          maxLength={100}
          defaultValue={centre?.city}
        />
      </label>
      <label>
        Postal code
        <input
          name="postalCode"
          required
          minLength={3}
          maxLength={15}
          defaultValue={centre?.postal_code}
        />
      </label>
      <label>
        Collection instructions / opening hours
        <textarea
          name="instructions"
          required
          minLength={10}
          maxLength={2000}
          defaultValue={centre?.instructions}
        />
      </label>
      <label>
        Approval reference
        <input name="reference" required minLength={3} maxLength={120} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="active"
          defaultChecked={centre?.active ?? false}
        />
        Available for new collection orders
      </label>
      <label className="check">
        <input type="checkbox" name="noFeeApproved" required />I approve these
        instructions and collection without an additional collection fee.
        Customers must pay online before collection.
      </label>
    </StaffActionForm>
  );
}
export default async function Centres() {
  const market = await currentMarket();
  const { client } = await session();
  const { data, error } = await client
    .from("service_centres")
    .select(
      "id,market,name,line1,city,postal_code,instructions,active,revision",
    )
    .eq("market", market)
    .order("name");
  const p = centreSchema.array().safeParse(data);
  return (
    <div className="stack">
      <h1>Service centres · {market}</h1>
      <p>
        Only approved active centres appear at checkout. Editing creates a new
        revision and invalidates earlier quotations. Existing orders keep their
        original instructions.
      </p>
      <details className="panel">
        <summary>Add a centre</summary>
        <CentreForm market={market} />
      </details>
      {error || !p.success ? (
        <p>Centres are unavailable for this market or role.</p>
      ) : (
        p.data.map((c) => (
          <details className="panel" key={c.id}>
            <summary>
              {c.name} · Revision {c.revision} ·{" "}
              {c.active ? "Available" : "Withdrawn"}
            </summary>
            <CentreForm market={market} centre={c} />
          </details>
        ))
      )}
    </div>
  );
}
