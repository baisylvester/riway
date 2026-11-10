import { notFound } from "next/navigation";
import { content, currentMarket } from "@/lib/data";
import { EventRegistration } from "@/components/forms";
import { eventZones, formatEventDate, formatEventTime } from "@/lib/events";
export default async function Event({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    market = await currentMarket();
  const e = (await content("event")).find(
    (entry) =>
      entry.slug === slug &&
      entry.kind === "event" &&
      entry.status === "published" &&
      (!entry.market || entry.market === market),
  );
  if (!e) notFound();
  const dated = e.starts_at && Number.isFinite(Date.parse(e.starts_at));
  return (
    <section className="section page-prose page-section">
      <span className="eyebrow">RIWAY EVENTS</span>
      <h1>{e.title}</h1>
      <p className="lead">{e.excerpt}</p>
      <p>
        {dated ? (
          <time dateTime={e.starts_at!}>
            {formatEventDate(e.starts_at!, market)} ·{" "}
            {formatEventTime(e.starts_at!, market)} ({eventZones[market].label})
          </time>
        ) : (
          "Date to be confirmed"
        )}{" "}
        · {e.location}
      </p>
      <div className="content-body">{e.body}</div>
      {e.starts_at && new Date(e.starts_at) > new Date() ? (
        <EventRegistration id={e.id} />
      ) : (
        <div className="notice">Registration is closed.</div>
      )}
    </section>
  );
}
