"use client";
import { useActionState } from "react";
import {
  saveProduct,
  saveContent,
  adjustStock,
  saveOffer,
} from "@/app/admin/actions";
import { markets, type Product } from "@/lib/domain";
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
}
export function ContentForm({ entry }: { entry?: Entry }) {
  const [s, a, p] = useActionState(saveContent, { message: "" });
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
      </div>
      <p className="small muted">
        Draft → review → compliance publication. Unapproved claims must stay
        unpublished.
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
