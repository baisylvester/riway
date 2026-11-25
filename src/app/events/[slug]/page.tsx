import { notFound } from "next/navigation";
import { content, currentMarket, session } from "@/lib/data";
import { eventAttendanceSchema } from "@/lib/event-attendance";
import { EventAttendees } from "@/components/event-attendance";
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
  const { client, user } = await session();
  const attendance = user
    ? eventAttendanceSchema.safeParse(
        (
          await client.rpc("event_attendance", {
            p_event: e.id,
            p_staff: false,
          })
        ).data,
      )
    : null;
  const dated = e.starts_at && Number.isFinite(Date.parse(e.starts_at));
  return (
    <section className="section page-prose page-section">
      <span className="eyebrow">RIWAY EVENTS</span>
      <h1>{e.title}</h1>
      <p className="lead">{e.excerpt}</p>
      {e.image_url && (
        <img
          className="content-image"
          src={e.image_url}
          alt=""
          loading="lazy"
          style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }}
        />
      )}
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
      {attendance?.success && <EventAttendees data={attendance.data} />}
      {e.starts_at && new Date(e.starts_at) > new Date() ? (
        <EventRegistration id={e.id} />
      ) : (
        <div className="notice">Registration is closed.</div>
      )}
    </section>
  );
}
