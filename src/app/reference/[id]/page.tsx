import { notFound } from "next/navigation";
import { z } from "zod";
import { content, currentMarket } from "@/lib/data";
export const metadata = {
  title: "Approved product reference",
  robots: { index: false, follow: false },
};
export default async function Reference({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const market = await currentMarket();
  const source = (await content("page")).find(
    (e) =>
      e.id === id &&
      e.slug.startsWith("assistant-") &&
      e.approved_at &&
      (!e.market || e.market === market) &&
      e.locale === "en",
  );
  if (!source) notFound();
  return (
    <article className="section page-section page-prose">
      <p className="eyebrow">RIWAY-APPROVED REFERENCE</p>
      <h1>{source.title}</h1>
      <div className="content-body">{source.body}</div>
      <p className="small muted">
        Approved {new Date(source.approved_at).toISOString().slice(0, 10)}. For
        current product labels or personal assistance, contact RIWAY support.
      </p>
    </article>
  );
}
