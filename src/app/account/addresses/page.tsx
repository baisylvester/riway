import { requireSession } from "@/lib/data";
import { deleteAddress } from "@/app/actions";
import { AddressForm } from "@/components/forms";
export default async function Addresses() {
  const { client, user } = await requireSession();
  const { data, error } = await client
    .from("addresses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw Error("Addresses could not be loaded.");
  return (
    <div className="two-column">
      <AddressForm />
      <div className="stack">
        {data.map((a) => (
          <div className="panel" key={a.id}>
            <h3>{a.full_name}</h3>
            <p>
              {a.line1}
              <br />
              {a.city} {a.postal_code}
              <br />
              {a.country}
            </p>
            <form action={deleteAddress.bind(null, a.id)}>
              <button className="button button-outline">Delete address</button>
            </form>
          </div>
        ))}
        {!data.length && (
          <div className="panel">
            <p>No saved addresses yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
