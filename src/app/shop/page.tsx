import { catalogue, currentMarket } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { markets } from "@/lib/domain";
export const metadata = { title: "Our collections" };
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "All" } = await searchParams;
  const { products } = await catalogue();
  const market = await currentMarket();
  const filtered = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      `${p.name} ${p.subtitle}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="section page-section">
      <span className="eyebrow">THE RIWAY COLLECTIONS</span>
      <h1>Discover your everyday extraordinary.</h1>
      <p className="lead">
        Explore our signature nutrition and personal care collections.
      </p>
      <div className="notice">
        {markets[market].name} · Product information is available for discovery.
        Online sales remain closed pending RIWAY policy and market registration
        approvals.
        {market === "PH" &&
          " No approved therapeutic claims. Read the label and consult a healthcare professional."}
      </div>
      <form className="filter-bar">
        <label>
          Search collections
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search products…"
          />
        </label>
        <label>
          Collection
          <select name="category" defaultValue={category}>
            {["All", "Nutrition", "Skincare", "Packages"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button className="button">Search</button>
      </form>
      <div className="result-count">
        {filtered.length} collection{filtered.length !== 1 ? "s" : ""}
      </div>
      <div className="products-grid">
        {filtered.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          <h2>No matching collections</h2>
          <p>Try another search or select all collections.</p>
        </div>
      )}
    </section>
  );
}
