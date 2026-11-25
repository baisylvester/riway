import Link from "next/link";
import { currentMarket, session } from "@/lib/data";
import { libraryResultsSchema, libraryQuery } from "@/lib/content-library";
import {
  LibraryFilters,
  LibraryEditor,
  LibraryReview,
} from "@/components/content-library";
export const metadata = { title: "Campaign content library" };
export default async function LibraryAdmin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const market = await currentMarket();
  const q = libraryQuery(await searchParams);
  const { client } = await session();
  const { data, error } = await client.rpc("search_library", {
    p_market: market,
    p_locale: q.locale,
    p_search: q.search,
    p_type: q.type,
    p_page: q.page,
    p_staff: true,
  });
  const parsed = libraryResultsSchema.safeParse(data);
  return (
    <div className="stack">
      <h1>Campaign content library</h1>
      <p>
        Save approved source material as a draft. Publication requires another
        market administrator or compliance reviewer. Each edit creates an
        immutable version. Withdrawal disables the application’s sharing page;
        external source hosts and copies already downloaded remain outside this
        control.
      </p>
      <LibraryFilters query={q} />
      <details className="panel">
        <summary>Create a campaign asset</summary>
        <LibraryEditor market={market} />
      </details>
      {error || !parsed.success ? (
        <p role="status">
          Library unavailable or your role does not allow this market.
        </p>
      ) : (
        <>
          <p>{parsed.data.total} assets</p>
          {parsed.data.assets.map((a) => (
            <article className="panel stack" key={a.id}>
              <h2>{a.title}</h2>
              <p>
                Draft version {a.revision}; live version{" "}
                {a.liveVersion ?? "none"}
              </p>
              <a href={a.url} rel="noopener noreferrer">
                Review source material
              </a>
              <p className="content-body">{a.transcript}</p>
              <p>{a.disclaimer}</p>
              <LibraryReview asset={a} />
              <details>
                <summary>Edit as a new version</summary>
                <LibraryEditor asset={a} market={market} />
              </details>
            </article>
          ))}
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
    </div>
  );
}
