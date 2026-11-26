import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { libraryAssetSchema } from "@/lib/content-library";
import { asMarket } from "@/lib/domain";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Approved RIWAY material",
  robots: { index: false, follow: false },
};
export default async function SharedMaterial({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ market?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const market = asMarket((await searchParams).market);
  const { data, error } = await (
    await db()
  ).rpc("shared_library_asset", { p_id: id, p_market: market });
  const parsed = libraryAssetSchema.safeParse(data);
  if (error)
    throw new Error("This material could not be loaded. Please try again.");
  if (!parsed.success) notFound();
  const a = parsed.data;
  return (
    <section className="section page-section page-prose">
      <p className="eyebrow">
        {a.campaign} · {market} · {a.locale} · VERSION {a.version}
      </p>
      <h1>{a.title}</h1>
      <p className="lead">{a.description}</p>
      {a.mediaType === "image" && (
        <img
          src={a.url}
          alt={a.title}
          className="content-image"
          style={{ maxWidth: "100%" }}
        />
      )}
      <a className="button" href={a.url} rel="noopener noreferrer">
        {a.mediaType === "video"
          ? "Watch approved video"
          : "Open approved material"}
      </a>
      {a.transcript && (
        <div>
          <h2>Accessible transcript</h2>
          <div className="content-body">{a.transcript}</div>
        </div>
      )}
      {a.disclaimer && <aside className="notice">{a.disclaimer}</aside>}
    </section>
  );
}
