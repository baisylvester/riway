import Link from "next/link";
import { content, currentMarket } from "@/lib/data";
export const metadata = { title: "Events" };
export default async function Events() {
  const entries = await content("event"),
    market = await currentMarket();
  const visible = entries.filter(
    (e) =>
      (!e.market || e.market === market) &&
      e.starts_at &&
      new Date(e.starts_at) > new Date(),
  );
  return (
    <section className="section page-section">
      <span className="eyebrow">MOMENTS THAT CONNECT US</span>
      <h1>
        Come together.
        <br />
        Go further.
      </h1>
      <p className="lead">
        Discover upcoming RIWAY events and community gatherings.
      </p>
      {visible.length ? (
        <div className="cards">
          {visible.map((e) => (
            <Link className="card" key={e.id} href={`/events/${e.slug}`}>
              <span className="eyebrow">
                {new Date(e.starts_at).toLocaleDateString("en-SG", {
                  dateStyle: "long",
                  timeZone: "Asia/Manila",
                })}
              </span>
              <h2>{e.title}</h2>
              <p>{e.excerpt}</p>
              <p>{e.location}</p>
              <span className="text-link">View event →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty panel">
          <h2>The next moment is on its way.</h2>
          <p>Confirmed, approved event details will appear here.</p>
        </div>
      )}
    </section>
  );
}
