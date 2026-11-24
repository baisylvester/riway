import { db } from "@/lib/supabase/server";
import type { Market } from "@/lib/domain";
import { productContentSchema, videoUrlPattern } from "@/lib/product-content";

// Compliance-published, market-specific product information. Renders nothing
// until approved content exists, so the existing notice remains the default.
export async function ProductContentPanel({
  productId,
  market,
}: {
  productId: string;
  market: Market;
}) {
  let content;
  try {
    const { data, error } = await (
      await db()
    )
      .from("product_market_content")
      .select("*")
      .eq("product_id", productId)
      .eq("market", market)
      .eq("locale", "en")
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    const parsed = productContentSchema.safeParse(data);
    if (!parsed.success) return null;
    content = parsed.data;
  } catch {
    return null;
  }
  const blocks: [string, string][] = [
    ["Ingredients", content.ingredients],
    ["How to use", content.usage],
    ["Label information", content.label_notes],
  ];
  return (
    <div className="panel stack" data-product-content={market}>
      {blocks
        .filter(([, text]) => text.trim())
        .map(([title, text]) => (
          <div key={title}>
            <h2>{title}</h2>
            {text.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ))}
      {content.video_url && videoUrlPattern.test(content.video_url) && (
        <p>
          <a href={content.video_url} rel="noopener noreferrer" target="_blank">
            Watch the product video ↗
          </a>
        </p>
      )}
      {content.regulatory_statement.trim() && (
        <p className="muted small">{content.regulatory_statement}</p>
      )}
    </div>
  );
}
