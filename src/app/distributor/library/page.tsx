import Link from "next/link";
import { requireSession } from "@/lib/data";
import { libraryResultsSchema, libraryQuery } from "@/lib/content-library";
import { LibraryFilters, LibraryCard } from "@/components/content-library";
export const metadata = { title: "Approved campaign library" };
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { client, user } = await requireSession();
  const q = libraryQuery(await searchParams);
  const { data: d } = await client
    .from("distributor_profiles")
    .select("market,active,verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!d?.active || !d.verified_at)
    return (
      <section className="section page-section">
        <h1>Distributor verification required</h1>
        <Link href="/distributor">Distributor dashboard</Link>
      </section>
    );
  const { data, error } = await client.rpc("search_library", {
    p_market: d.market,
    p_locale: q.locale,
    p_search: q.search,
    p_type: q.type,
    p_page: q.page,
    p_staff: false,
  });
  const parsed = libraryResultsSchema.safeParse(data);
  return (
    <section className="section page-section stack">
      <h1>Approved campaign library</h1>
      <p>
        Find current materials approved for your market. Share the application
        link so withdrawn or superseded content is no longer shown. Do not
        change approved claims or disclaimers.
      </p>
      <LibraryFilters query={q} />
      {error || !parsed.success ? (
        <p role="status">The library could not be loaded.</p>
      ) : (
        <>
          <p>
            {parsed.data.total} approved assets for {d.market}
          </p>
          <div className="cards">
            {parsed.data.assets.map((a) => (
              <LibraryCard key={a.id} asset={a} market={d.market} />
            ))}
          </div>
          <nav aria-label="Library pages">
            {q.page > 0 && (
              <Link
                href={`?page=${q.page - 1}&q=${encodeURIComponent(q.search)}&locale=${q.locale ?? ""}&type=${q.type ?? ""}`}
              >
                Previous page
              </Link>
            )}
            {(q.page + 1) * 25 < parsed.data.total && (
              <Link
                href={`?page=${q.page + 1}&q=${encodeURIComponent(q.search)}&locale=${q.locale ?? ""}&type=${q.type ?? ""}`}
              >
                Next page
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
