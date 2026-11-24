import Link from "next/link";
import { z } from "zod";
import { currentMarket } from "@/lib/data";
import { markets } from "@/lib/domain";
import { db } from "@/lib/supabase/server";
import { directoryEntrySchema } from "@/lib/distributor-directory";

export const metadata = {
  title: "Find a Distributor",
  description:
    "Find a verified RIWAY distributor who has chosen to be listed in your market.",
};

export default async function FindDistributor({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const market = await currentMarket();
  const city = ((await searchParams).city ?? "").trim().slice(0, 80);
  let results: z.infer<typeof directoryEntrySchema>[] | null = null;
  try {
    const { data, error } = await (
      await db()
    ).rpc("find_distributors", {
      p_market: market,
      p_city: city || null,
    });
    const parsed = z.array(directoryEntrySchema).safeParse(data);
    results = !error && parsed.success ? parsed.data : null;
  } catch {
    results = null;
  }
  return (
    <section className="section page-section">
      <span className="eyebrow">FIND A DISTRIBUTOR</span>
      <h1>Connect with a verified distributor.</h1>
      <p className="lead">
        Verified RIWAY distributors in {markets[market].name} who have chosen to
        be listed. Change your country at the top of the page to see another
        market.
      </p>
      <form method="get" className="admin-actions">
        <label>
          City
          <input name="city" maxLength={80} defaultValue={city} />
        </label>
        <button className="button">Search</button>
      </form>
      {results === null ? (
        <p className="notice">The distributor list is unavailable right now.</p>
      ) : results.length === 0 ? (
        <p className="muted">
          No listed distributors match yet. You can also contact RIWAY through{" "}
          <Link href="/support">Support</Link>.
        </p>
      ) : (
        <div className="cards">
          {results.map((d) => (
            <div className="card" key={d.code}>
              {d.photo_url && (
                <img
                  src={d.photo_url}
                  alt={`${d.display_name}, verified RIWAY distributor`}
                  width={80}
                  height={80}
                  style={{ borderRadius: "50%", objectFit: "cover" }}
                />
              )}
              <h2>{d.display_name}</h2>
              <p className="muted">
                {d.city ? `${d.city} · ` : ""}
                {markets[d.market].name}
              </p>
              <Link
                className="text-link"
                href={`/d/${encodeURIComponent(d.code)}`}
              >
                Visit their introduction page →
              </Link>
            </div>
          ))}
        </div>
      )}
      <p className="muted small">
        Listing does not create membership, placement or commission
        entitlements. Distributors are independent; RIWAY does not publish their
        contact details.
      </p>
    </section>
  );
}
