import Link from "next/link";
import { requireSession } from "@/lib/data";
import { money } from "@/lib/domain";
export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(
    1,
    Math.min(1000, Number((await searchParams).page) || 1),
  );
  const { client, user } = await requireSession();
  const { data, error } = await client
    .from("orders")
    .select("id,total_minor,currency,status,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw Error("Orders could not be loaded.");
  return (
    <div className="panel">
      <h2>Your orders</h2>
      {!data.length ? (
        <div className="empty">
          <p>You haven’t placed an order yet.</p>
          <Link className="text-link" href="/shop">
            Explore collections →
          </Link>
        </div>
      ) : (
        data.map((o) => (
          <Link
            className="order-row"
            key={o.id}
            href={`/account/orders/${o.id}`}
          >
            <div>
              <h3>Order {o.id.slice(0, 8).toUpperCase()}</h3>
              <span className="small muted">
                {new Date(o.created_at).toLocaleDateString("en-SG", {
                  timeZone: "Asia/Manila",
                })}
              </span>
            </div>
            <span>
              {money(o.total_minor, o.currency)}{" "}
              <span className="status">{o.status}</span>
            </span>
          </Link>
        ))
      )}
      <div className="tab-links">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {data.length === 20 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </div>
    </div>
  );
}
