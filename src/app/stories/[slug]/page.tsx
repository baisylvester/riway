import { notFound } from "next/navigation";
import { content, currentMarket } from "@/lib/data";
import { db } from "@/lib/supabase/server";
import { libraryAssetSchema } from "@/lib/content-library";
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
  const media = e.story_asset_id
    ? libraryAssetSchema.safeParse(
        (
          await (
            await db()
          ).rpc("shared_library_asset", {
            p_id: e.story_asset_id,
            p_market: market,
          })
        ).data,
      )
    : null;
  if (e.story_asset_id && !media?.success) notFound();
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
      {media?.success && (
        <section className="panel stack">
          <h2>{media.data.title}</h2>
          <a className="button" href={media.data.url} rel="noopener noreferrer">
            {media.data.mediaType === "video"
              ? "Watch approved story"
              : "Open approved documentary material"}
          </a>
          {media.data.transcript && (
            <div>
              <h3>Accessible transcript</h3>
              <div className="content-body">{media.data.transcript}</div>
            </div>
          )}
          <aside className="notice">{media.data.disclaimer}</aside>
        </section>
      )}
      <div className="notice">
        Individual experiences vary. No approved therapeutic claims. Income and
        product results are not guaranteed.
      </div>
    </article>
  );
}
