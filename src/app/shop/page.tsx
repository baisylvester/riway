import { catalogue, currentMarket } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { markets } from "@/lib/domain";
import { currentLocale } from "@/lib/locale-server";
import { ui } from "@/lib/ui-dictionaries";
export const metadata = { title: "Our collections" };
const categories = ["All", "Nutrition", "Skincare", "Packages"] as const;
const firstValue = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const locale = await currentLocale();
  const t = (
    key: Parameters<typeof ui>[1],
    values?: Record<string, string | number>,
  ) => ui(locale, key, values);
  const q = firstValue(query.q).trim();
  const category =
    categories.find((value) => value === firstValue(query.category)) ?? "All";
  const { products } = await catalogue();
  const market = await currentMarket();
  const filtered = products.filter(
    (p) =>
      (category === "All" || p.category === category) &&
      `${p.name} ${p.subtitle}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="section page-section" lang={locale}>
      <span className="eyebrow">{t("catalogueEyebrow")}</span>
      <h1>{t("catalogueTitle")}</h1>
      <p className="lead">{t("catalogueIntro")}</p>
      <div className="notice" lang="en">
        {markets[market].name} · Product information is available for discovery.
        Online sales remain closed pending RIWAY policy and market registration
        approvals.
        {market === "PH" &&
          " No approved therapeutic claims. Read the label and consult a healthcare professional."}
      </div>
      <form className="filter-bar">
        <label>
          {t("searchCollections")}
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchProducts")}
          />
        </label>
        <label>
          {t("collection")}
          <select name="category" defaultValue={category}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(
                  c === "All"
                    ? "all"
                    : c === "Nutrition"
                      ? "nutrition"
                      : c === "Skincare"
                        ? "skincare"
                        : "packages",
                )}
              </option>
            ))}
          </select>
        </label>
        <button className="button">{t("search")}</button>
      </form>
      <div className="result-count">
        {locale === "en" ? (
          <>
            {filtered.length} collection{filtered.length !== 1 ? "s" : ""}
          </>
        ) : (
          t("results", { count: filtered.length })
        )}
      </div>
      <div className="products-grid">
        {filtered.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          <h2>{t("noResults")}</h2>
          <p>{t("trySearch")}</p>
        </div>
      )}
    </section>
  );
}
