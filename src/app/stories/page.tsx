import Link from "next/link";
import { content, currentMarket } from "@/lib/data";
export const metadata = { title: "Our stories" };
export default async function Stories() {
  const entries = await content("story"),
    market = await currentMarket();
  const visible = entries.filter((e) => !e.market || e.market === market);
  return (
    <section className="section page-section">
      <span className="eyebrow">PEOPLE BEHIND THE JOURNEY</span>
      <h1>Every connection has a story.</h1>
      <p className="lead">Stories from our community, shared with care.</p>
      {visible.length ? (
        <div className="cards">
          {visible.map((e) => (
            <Link className="card" key={e.id} href={`/stories/${e.slug}`}>
              <h2>{e.title}</h2>
              <p>{e.excerpt}</p>
              <span className="text-link">Read story →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty panel">
          <h2>Stories worth sharing.</h2>
          <p>
            Approved community stories will appear here. No unreviewed
            testimonials or product claims are published.
          </p>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 25 }}>
        Individual experiences vary. Stories are not medical advice or
        guarantees of income or product results.
      </p>
    </section>
  );
}
