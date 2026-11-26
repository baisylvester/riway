"use client";
import { useActionState } from "react";
import {
  saveProduct,
  saveContent,
  adjustStock,
  saveOffer,
  saveRecommendations,
} from "@/app/admin/actions";
import { markets, type Product } from "@/lib/domain";
import { isoToUtcInput } from "@/lib/content-schedule";
export function ProductForm({ product }: { product?: Product }) {
  const [s, a, p] = useActionState(saveProduct, { message: "" });
  return (
    <form className="panel stack" action={a}>
      <h2>{product ? "Edit product" : "New product"}</h2>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <div className="form-grid">
        <label>
          Name
          <input
            name="name"
            defaultValue={product?.name}
            required
            maxLength={120}
          />
        </label>
        <label>
          URL slug
          <input
            name="slug"
            defaultValue={product?.slug}
            required
            pattern="[a-z0-9-]+"
          />
        </label>
        <label>
          Collection
          <select name="category" defaultValue={product?.category}>
            {["Nutrition", "Skincare", "Packages"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={product?.status ?? "draft"}>
            {["draft", "review", "published", "archived"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Subtitle
          <input
            name="subtitle"
            defaultValue={product?.subtitle}
            maxLength={200}
          />
        </label>
        <label className="full">
          Description
          <textarea
            name="description"
            defaultValue={product?.description}
            maxLength={10000}
          />
        </label>
      </div>
      <p className="small muted">
        Only compliance or admin staff may publish product content.
      </p>
      <button className="button" disabled={p}>
        Save product
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
// Staff-curated cross-sell. Shoppers only see picks that are published and
// priced in their market; leave a slot empty to remove it.
export function RecommendationForm({
  product,
  products,
  current,
}: {
  product: Product;
  products: Product[];
  current: string[];
}) {
  const [s, a, p] = useActionState(saveRecommendations, { message: "" });
  const options = products.filter(
    (o) => o.id !== product.id && o.status !== "archived",
  );
  return (
    <form className="panel stack" action={a}>
      <h2>Pairs well with</h2>
      <p className="small muted">
        Up to four products shown on this product&apos;s page, in this order.
        Only published products with an approved price in the shopper&apos;s
        market appear.
      </p>
      <input type="hidden" name="productId" value={product.id} />
      <div className="form-grid">
        {[0, 1, 2, 3].map((slot) => (
          <label key={slot}>
            Suggestion {slot + 1}
            <select name="pick" defaultValue={current[slot] ?? ""}>
              <option value="">None</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.status === "published" ? "" : ` (${o.status})`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button className="button" disabled={p}>
        Save suggestions
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
interface Entry {
  id: string;
  slug: string;
  kind: string;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  market: string | null;
  location: string | null;
  starts_at: string | null;
  image_url?: string | null;
  publish_at?: string | null;
  unpublish_at?: string | null;
  story_asset_id?: string | null;
}
export interface PublishedImage {
  url: string;
  name: string;
  market: string;
}
export function ContentForm({
  entry,
  images = [],
}: {
  entry?: Entry;
  images?: PublishedImage[];
}) {
  const [s, a, p] = useActionState(saveContent, { message: "" });
  const current = entry?.image_url ?? "";
  const imageChoices =
    current && !images.some((i) => i.url === current)
      ? [{ url: current, name: "Current image", market: "" }, ...images]
      : images;
  return (
    <form action={a} className="panel stack">
      <h2>{entry ? "Edit content" : "New content"}</h2>
      <input name="id" type="hidden" value={entry?.id ?? ""} />
      <div className="form-grid">
        <label>
          Title
          <input
            name="title"
            required
            defaultValue={entry?.title}
            maxLength={160}
          />
        </label>
        <label>
          URL slug
          <input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            defaultValue={entry?.slug}
          />
        </label>
        <label>
          Type
          <select name="kind" defaultValue={entry?.kind ?? "article"}>
            {["page", "article", "story", "event"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Market
          <select name="market" defaultValue={entry?.market ?? ""}>
            <option value="">Global</option>
            {Object.entries(markets).map(([c, m]) => (
              <option value={c} key={c}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={entry?.status ?? "draft"}>
            {["draft", "review", "published", "archived"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Event date & time (UTC)
          <input
            name="starts_at"
            type="datetime-local"
            defaultValue={entry?.starts_at?.slice(0, 16) ?? ""}
          />
        </label>
        <label>
          Publish from (UTC, optional)
          <input
            name="publish_at"
            type="datetime-local"
            defaultValue={isoToUtcInput(entry?.publish_at)}
          />
        </label>
        <label>
          Unpublish at (UTC, optional)
          <input
            name="unpublish_at"
            type="datetime-local"
            defaultValue={isoToUtcInput(entry?.unpublish_at)}
          />
        </label>
        <label className="full">
          Image
          <select name="image_url" defaultValue={current}>
            <option value="">No image</option>
            {imageChoices.map((i) => (
              <option value={i.url} key={i.url}>
                {i.market ? `${i.name} (${i.market})` : i.name}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Event location
          <input
            name="location"
            defaultValue={entry?.location ?? ""}
            maxLength={300}
          />
        </label>
        <label className="full">
          Excerpt
          <textarea
            name="excerpt"
            maxLength={1000}
            defaultValue={entry?.excerpt}
          />
        </label>
        <label className="full">
          Body (plain text)
          <textarea name="body" maxLength={30000} defaultValue={entry?.body} />
        </label>
        <label className="full">
          Reviewed story media asset ID (optional)
          <input
            name="story_asset_id"
            defaultValue={entry?.story_asset_id ?? ""}
            pattern="[0-9a-fA-F-]{36}"
            maxLength={36}
          />
          <span className="small muted">
            For a story, use a live campaign-library asset with approved rights,
            accessible transcript and disclaimer. Choose its market before
            publication.
          </span>
        </label>
      </div>
      <p className="small muted">
        Draft → review → compliance publication. Unapproved claims must stay
        unpublished. An approved entry is public only between its publish and
        unpublish times; leave both empty to publish immediately. Images come
        from editorial media published for the same market.
      </p>
      <button className="button" disabled={p}>
        Save content
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
export function StockForm({ products }: { products: Product[] }) {
  const [s, a, p] = useActionState(adjustStock, { message: "" });
  return (
    <form action={a} className="panel stack">
      <h2>Adjust stock</h2>
      <label>
        Product
        <select name="product_id">
          {products.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Market
          <select name="market">
            {Object.entries(markets).map(([c, m]) => (
              <option value={c} key={c}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Adjustment (+ / −)
          <input
            name="delta"
            type="number"
            required
            min={-100000}
            max={100000}
          />
        </label>
      </div>
      <label>
        Reason
        <textarea name="reason" minLength={5} maxLength={500} required />
      </label>
      <button className="button" disabled={p}>
        Record adjustment
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
export function OfferForm({ products }: { products: Product[] }) {
  const [s, a, p] = useActionState(saveOffer, { message: "" });
  return (
    <form action={a} className="panel stack">
      <h2>Set approved pricing</h2>
      <label>
        Product
        <select name="product_id">
          {products.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Market
          <select name="market">
            {Object.entries(markets).map(([c, m]) => (
              <option value={c} key={c}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select name="currency">
            {["PHP", "SGD", "MYR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Retail price (minor units)
          <input
            name="retail_minor"
            type="number"
            min={1}
            max={100000000}
            required
          />
        </label>
        <label>
          Member price (minor units)
          <input name="member_minor" type="number" min={1} max={100000000} />
        </label>
        <label>
          Maximum quantity
          <input
            name="max_quantity"
            type="number"
            min={1}
            max={24}
            defaultValue={6}
            required
          />
        </label>
      </div>
      <button className="button" disabled={p}>
        Save pricing
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
