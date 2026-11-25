import { bonusItemsSchema } from "@/lib/bonus-campaigns";
export function BonusItems({ items }: { items: unknown }) {
  const parsed = bonusItemsSchema.safeParse(items);
  if (!parsed.success || !parsed.data.length) return null;
  return (
    <aside className="notice" aria-label="Included bonus goods">
      <h3>Included bonus goods</h3>
      {parsed.data.map((b) => (
        <div key={b.campaignId}>
          <p>
            <strong>
              {b.name} × {b.quantity}
            </strong>{" "}
            · No additional charge
          </p>
          <p>{b.campaignName}</p>
          <p className="content-body">{b.returnTerms}</p>
        </div>
      ))}
    </aside>
  );
}
