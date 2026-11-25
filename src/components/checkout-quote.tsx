import { money } from "@/lib/domain";
import type { CommerceQuote } from "@/lib/commerce-checkout";
import { BonusItems } from "./bonus-items";
export function CheckoutQuote({ quote }: { quote: CommerceQuote }) {
  return (
    <div className="stack" aria-label="Current order total">
      {quote.fulfilment && (
        <div className="notice">
          {quote.fulfilment.method === "collection" ? (
            <>
              <strong>Collection: {quote.fulfilment.name}</strong>
              <p>
                {quote.fulfilment.line1}, {quote.fulfilment.city},{" "}
                {quote.fulfilment.postalCode}
              </p>
              <p>{quote.fulfilment.instructions}</p>
              <p>No additional collection fee.</p>
            </>
          ) : (
            "Delivery to the address entered at checkout."
          )}
        </div>
      )}
      {quote.items.map((item) => (
        <div className="order-row" key={item.productId}>
          <span>
            {item.name} × {item.quantity}
            {item.packageOfferId && <small> · Package</small>}
          </span>
          <span>
            {money(item.netMinor, quote.currency)}
            {item.discountMinor > 0 && (
              <small>
                {" "}
                · Discount {money(item.discountMinor, quote.currency)}
              </small>
            )}
          </span>
        </div>
      ))}
      <div className="order-row">
        <span>Subtotal</span>
        <span>{money(quote.subtotalMinor, quote.currency)}</span>
      </div>
      <BonusItems items={quote.bonusItems} />
      {quote.promotion && (
        <div className="order-row">
          <span>
            {quote.promotion.name} · {quote.promotion.code}
          </span>
          <span>−{money(quote.discountMinor, quote.currency)}</span>
        </div>
      )}
      <p className="price">Total {money(quote.totalMinor, quote.currency)}</p>
      <p className="small muted">
        Prices, offer eligibility and stock are checked again when you continue.
      </p>
    </div>
  );
}
