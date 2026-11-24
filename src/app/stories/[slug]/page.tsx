import { notFound } from "next/navigation";
import { content, currentMarket } from "@/lib/data";
export default async function Story({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params,
    market = await currentMarket();
  const e = (await content("story")).find(
    (e) => e.slug === slug && (!e.market || e.market === market),
  );
  if (!e) notFound();
  return (
    <article className="section page-prose page-section">
      <span className="eyebrow">OUR STORIES</span>
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
      <div className="content-body">{e.body}</div>
      <div className="notice">
        Individual experiences vary. No approved therapeutic claims. Income and
        product results are not guaranteed.
      </div>
    </article>
  );
}
