import Link from "next/link";
import { content, currentMarket } from "@/lib/data";
import { markets } from "@/lib/domain";
import { EventCalendar } from "@/components/event-calendar";
import {
  eventZones,
  formatEventDate,
  formatEventTime,
  upcomingEvents,
} from "@/lib/events";
export const metadata = { title: "Events" };
export default async function Events({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const [entries, market, query] = await Promise.all([
    content("event"),
    currentMarket(),
    searchParams,
  ]);
  const now = new Date();
  const visible = upcomingEvents(entries, market, now);
  return (
    <section className="section page-section">
      <span className="eyebrow">MOMENTS THAT CONNECT US</span>
      <h1>
        Come together.
        <br />
        Go further.
      </h1>
      <p className="lead">
        Discover approved RIWAY events and community gatherings for{" "}
        {markets[market].name}.
      </p>
      <EventCalendar
        entries={entries}
        market={market}
        month={query.month}
        now={now}
      />
      <h2>Upcoming events</h2>
      <p className="small muted">
        Dates and times are shown in {eventZones[market].label}. Open an event
        for details and registration.
      </p>
      {visible.length ? (
        <div className="cards">
          {visible.map((e) => (
            <Link className="card" key={e.id} href={`/events/${e.slug}`}>
              <span className="eyebrow">
                <time dateTime={e.starts_at!}>
                  {formatEventDate(e.starts_at!, market)} ·{" "}
                  {formatEventTime(e.starts_at!, market)}
                </time>
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
