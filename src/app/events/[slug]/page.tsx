import { notFound } from "next/navigation";
import { content, currentMarket } from "@/lib/data";
import { EventRegistration } from "@/components/forms";
export default async function Event({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    market = await currentMarket();
  const e = (await content("event")).find(
    (e) => e.slug === slug && (!e.market || e.market === market),
  );
  if (!e) notFound();
  return (
    <section className="section page-prose page-section">
      <span className="eyebrow">RIWAY EVENTS</span>
      <h1>{e.title}</h1>
      <p className="lead">{e.excerpt}</p>
      <p>
        {e.starts_at
          ? new Date(e.starts_at).toLocaleString("en-SG", {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Asia/Manila",
            }) + " (Manila time)"
          : "Date to be confirmed"}{" "}
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
