import { db } from "@/lib/supabase/server";
import type { Market } from "@/lib/domain";
import { productContentSchema, videoUrlPattern } from "@/lib/product-content";
import { currentLocale } from "@/lib/locale-server";
import { ui } from "@/lib/ui-dictionaries";

// Compliance-published, market-specific product information. Renders nothing
// until approved content exists, so the existing notice remains the default.
export async function ProductContentPanel({
  productId,
  market,
}: {
  productId: string;
  market: Market;
}) {
  const locale = await currentLocale();
  let content;
  try {
    const { data, error } = await (
      await db()
    )
      .from("product_market_content")
      .select("*")
      .eq("product_id", productId)
      .eq("market", market)
      .in("locale", locale === "en" ? ["en"] : [locale, "en"])
      .eq("status", "published");
    if (error || !data) return null;
    const selected =
      data.find((row) => row.locale === locale) ??
      data.find((row) => row.locale === "en");
    const parsed = productContentSchema.safeParse(selected);
    if (!parsed.success) return null;
    content = parsed.data;
  } catch {
    return null;
  }
  const blocks: [string, string][] = [
    [ui(locale, "ingredients"), content.ingredients],
    [ui(locale, "usage"), content.usage],
    [ui(locale, "labels"), content.label_notes],
  ];
  return (
    <div
      className="panel stack"
      data-product-content={market}
      lang={content.locale}
    >
      {content.locale !== locale && (
        <p lang={locale} className="notice">
          {ui(locale, "contentEnglish")}
        </p>
      )}
      {blocks
        .filter(([, text]) => text.trim())
        .map(([title, text]) => (
          <div key={title}>
            <h2 lang={locale}>{title}</h2>
            {text.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ))}
      {content.video_url && videoUrlPattern.test(content.video_url) && (
        <p>
          <a
            href={content.video_url}
            rel="noopener noreferrer"
            target="_blank"
            lang={locale}
          >
            {ui(locale, "watchVideo")} ↗
          </a>
        </p>
      )}
      {content.regulatory_statement.trim() && (
        <p className="muted small">{content.regulatory_statement}</p>
      )}
    </div>
  );
}
