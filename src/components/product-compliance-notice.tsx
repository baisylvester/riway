import { markets, type Market } from "@/lib/domain";

export function ProductComplianceNotice({ market }: { market: Market }) {
  return (
    <div className="notice" data-product-compliance={market}>
      <p>
        Product information for {markets[market].name}. Market-specific labels,
        ingredients and directions are awaiting RIWAY’s approved content.
        Contact RIWAY for official product information. Online purchasing is
        unavailable while market approval, official pricing and sales terms are
        being verified.
      </p>
      {market === "PH" && (
        <p>
          Philippine product approval is pending according to the project brief.
          No approved therapeutic claims. Read the label and consult a
          healthcare professional.
        </p>
      )}
    </div>
  );
}
