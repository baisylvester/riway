import { z } from "zod";
import { session } from "@/lib/data";
import { StaffActionForm } from "@/components/staff-action-form";
import { productContentSchema } from "@/lib/product-content";
import { saveProductContent } from "./actions";

export const metadata = { title: "Product content" };

const markets = ["PH", "SG", "MY"] as const;

export default async function ProductContentAdmin({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  const requested = (await searchParams).market;
  const market = markets.find((m) => m === requested) ?? "PH";
  const { client } = await session();
  const [products, rows] = await Promise.all([
    client
      .from("products")
      .select("id,name")
      .neq("status", "archived")
      .order("name"),
    client
      .from("product_market_content")
      .select("*")
      .eq("market", market)
      .eq("locale", "en"),
  ]);
  const content = z.array(productContentSchema).safeParse(rows.data);
  const byProduct = new Map(
    (content.success ? content.data : []).map((c) => [c.product_id, c]),
  );
  return (
    <>
      <h1>Product content</h1>
      <p className="muted">
        RIWAY-approved ingredients, usage, label information, regulatory
        statement and video link for each market. Editors save drafts or send
        them for review. Only market admin or compliance can publish, with the
        approval reference. Published content appears on the product page; do
        not enter claims that are not approved.
      </p>
      <form method="get" className="admin-actions">
        <label>
          Market
          <select name="market" defaultValue={market}>
            {markets.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button className="button button-outline">Show</button>
      </form>
      {products.error ? (
        <p className="notice">Products are unavailable.</p>
      ) : (
        (products.data ?? []).map((p: { id: string; name: string }) => {
          const c = byProduct.get(p.id);
          return (
            <section className="panel stack" key={p.id}>
              <h2>
                {p.name} · {market}{" "}
                <span className="status">{c?.status ?? "none"}</span>
              </h2>
              <StaffActionForm action={saveProductContent} submit="Save">
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="market" value={market} />
                <label>
                  Ingredients
                  <textarea
                    name="ingredients"
                    rows={3}
                    maxLength={4000}
                    defaultValue={c?.ingredients ?? ""}
                  />
                </label>
                <label>
                  How to use
                  <textarea
                    name="usage"
                    rows={3}
                    maxLength={4000}
                    defaultValue={c?.usage ?? ""}
                  />
                </label>
                <label>
                  Label information
                  <textarea
                    name="labelNotes"
                    rows={2}
                    maxLength={2000}
                    defaultValue={c?.label_notes ?? ""}
                  />
                </label>
                <label>
                  Regulatory statement
                  <textarea
                    name="regulatoryStatement"
                    rows={2}
                    maxLength={2000}
                    defaultValue={c?.regulatory_statement ?? ""}
                  />
                </label>
                <label>
                  Video link (YouTube or Vimeo)
                  <input
                    name="videoUrl"
                    maxLength={300}
                    defaultValue={c?.video_url ?? ""}
                  />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={c?.status ?? "draft"}>
                    <option value="draft">Draft</option>
                    <option value="review">Ready for review</option>
                    <option value="published">Published</option>
                  </select>
                </label>
                <label>
                  Approval reference
                  <input
                    name="approvalReference"
                    maxLength={120}
                    defaultValue={c?.approval_reference ?? ""}
                  />
                </label>
              </StaffActionForm>
            </section>
          );
        })
      )}
    </>
  );
}
