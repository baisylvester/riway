"use client";

import { useActionState, useRef, useState } from "react";
import { saveCommerceDraft } from "@/app/admin/commerce-actions";
import type { CommerceDraft, DraftKind } from "@/lib/commerce-drafts";
import { markets, type Market, type Product } from "@/lib/domain";

const major = (minor: number | null) =>
  minor === null ? "" : (minor / 100).toFixed(2);

export function CommerceDraftForm({
  kind,
  draft,
  availableMarkets,
  products,
}: {
  kind: DraftKind;
  draft?: CommerceDraft;
  availableMarkets: Market[];
  products: Product[];
}) {
  const [state, action, pending] = useActionState(saveCommerceDraft, {
    message: "",
  });
  const current = state.saved ?? draft;
  const packageDefinition =
    draft?.kind === "package" ? draft.definition : undefined;
  const promotion = draft?.kind === "promotion" ? draft.definition : undefined;
  const [components, setComponents] = useState(() =>
    (packageDefinition?.components ?? [{ productId: "", quantity: 1 }]).map(
      (item, key) => ({ ...item, key }),
    ),
  );
  const nextKey = useRef(components.length);
  const [market, setMarket] = useState<Market>(
    draft?.market ?? availableMarkets[0],
  );
  const [discountType, setDiscountType] = useState(
    promotion?.discountType ?? "percent",
  );
  const currency = markets[market].currency;
  const componentsProducts = products.filter(
    (product) =>
      product.category !== "Packages" && product.status !== "archived",
  );
  const savedProductIds =
    packageDefinition?.components.map((item) => item.productId) ??
    promotion?.productIds ??
    [];
  const unavailable = savedProductIds.some(
    (id) =>
      !products.some(
        (product) =>
          product.id === id &&
          product.status !== "archived" &&
          (kind !== "package" || product.category !== "Packages"),
      ),
  );
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h2>
        {current ? "Edit" : "New"}{" "}
        {kind === "package" ? "package" : "promotion"} draft
      </h2>
      <p className="muted">
        Prepare proposed rules for review. Drafts do not change the shop,
        checkout or current prices.
      </p>
      {unavailable && (
        <p className="notice" role="alert">
          Some saved products are no longer available. Review all product
          selections before saving this draft.
        </p>
      )}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="draftId" value={current?.id ?? ""} />
      <input
        type="hidden"
        name="expectedRevision"
        value={current?.revision ?? 0}
      />
      {current && <input type="hidden" name="market" value={current.market} />}
      <fieldset
        disabled={pending}
        className="stack"
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <div className="form-grid">
          <label>
            Name
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={draft?.name}
            />
          </label>
          <label>
            Market
            <select
              name={current ? undefined : "market"}
              value={market}
              disabled={!!current}
              onChange={(event) => setMarket(event.target.value as Market)}
            >
              {availableMarkets.map((code) => (
                <option value={code} key={code}>
                  {markets[code].name} · {markets[code].currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={draft?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="review">Ready for review</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        {kind === "package" ? (
          <>
            <fieldset className="stack">
              <legend>Package components</legend>
              <input
                type="hidden"
                name="componentCount"
                value={components.length}
              />
              {components.map((item, i) => (
                <div className="form-grid" key={item.key}>
                  <label>
                    Product {i + 1}
                    <select
                      name={`componentProduct_${i}`}
                      required
                      defaultValue={item.productId}
                    >
                      <option value="">Select a product</option>
                      {componentsProducts.map((product) => (
                        <option value={product.id} key={product.id}>
                          {product.name} · {product.status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Units
                    <input
                      name={`componentQuantity_${i}`}
                      type="number"
                      required
                      min={1}
                      max={1000}
                      step={1}
                      defaultValue={item.quantity}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={components.length === 1}
                    onClick={() =>
                      setComponents((rows) =>
                        rows.filter((row) => row.key !== item.key),
                      )
                    }
                  >
                    Remove product {i + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button-outline"
                disabled={components.length >= 30}
                onClick={() =>
                  setComponents((rows) => [
                    ...rows,
                    { key: nextKey.current++, productId: "", quantity: 1 },
                  ])
                }
              >
                Add component
              </button>
            </fieldset>
            <div className="form-grid">
              <label>
                Proposed retail price ({currency}, optional)
                <input
                  name="retailAmount"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  defaultValue={major(packageDefinition?.retailMinor ?? null)}
                />
              </label>
              <label>
                Proposed member price ({currency}, optional)
                <input
                  name="memberAmount"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  defaultValue={major(packageDefinition?.memberMinor ?? null)}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <fieldset className="stack">
              <legend>Products included</legend>
              {products
                .filter((product) => product.status !== "archived")
                .map((product) => (
                  <label className="checkbox" key={product.id}>
                    <input
                      type="checkbox"
                      name="productIds"
                      value={product.id}
                      defaultChecked={promotion?.productIds.includes(
                        product.id,
                      )}
                    />
                    <span>
                      {product.name} · {product.status}
                    </span>
                  </label>
                ))}
            </fieldset>
            <div className="form-grid">
              <label>
                Discount type
                <select
                  name="discountType"
                  value={discountType}
                  onChange={(event) =>
                    setDiscountType(event.target.value as "percent" | "fixed")
                  }
                >
                  <option value="percent">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label>
                {discountType === "percent"
                  ? "Discount percent"
                  : `Discount amount (${currency})`}
                <input
                  name="discountAmount"
                  type="number"
                  required
                  min="0.01"
                  max={discountType === "percent" ? "100" : "1000000"}
                  step="0.01"
                  defaultValue={major(promotion?.discountValue ?? null)}
                />
              </label>
              <label>
                Minimum subtotal ({currency})
                <input
                  name="minimumSubtotal"
                  type="number"
                  required
                  min="0"
                  max="1000000"
                  step="0.01"
                  defaultValue={major(promotion?.minimumSubtotalMinor ?? 0)}
                />
              </label>
              <label>
                Maximum discount ({currency}, optional)
                <input
                  name="maximumDiscount"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  disabled={discountType !== "percent"}
                  defaultValue={major(promotion?.maximumDiscountMinor ?? null)}
                />
              </label>
              <label>
                Voucher code (optional)
                <input
                  name="voucherCode"
                  maxLength={40}
                  minLength={3}
                  pattern="[A-Za-z0-9-]+"
                  defaultValue={promotion?.voucherCode ?? ""}
                />
              </label>
              <label>
                Audience
                <select
                  name="audience"
                  defaultValue={promotion?.audience ?? "all"}
                >
                  <option value="all">All customers</option>
                  <option value="retail">Retail customers</option>
                  <option value="member">Members</option>
                </select>
              </label>
              <label>
                Starts at (UTC)
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  min="1900-01-01T00:00"
                  max="2100-12-31T23:59"
                  defaultValue={promotion?.startsAt.slice(0, 16)}
                />
              </label>
              <label>
                Ends at (UTC)
                <input
                  name="endsAt"
                  type="datetime-local"
                  required
                  min="1900-01-01T00:00"
                  max="2100-12-31T23:59"
                  defaultValue={promotion?.endsAt.slice(0, 16)}
                />
              </label>
              <label>
                Total redemption limit (optional)
                <input
                  name="usageLimit"
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  defaultValue={promotion?.usageLimit ?? ""}
                />
              </label>
            </div>
          </>
        )}
        <button className="button" disabled={pending || !products.length}>
          {pending ? "Saving…" : "Save draft"}
        </button>
      </fieldset>
      {current && (
        <p className="small muted">
          Version {current.revision}. Reload before editing if another staff
          member has saved changes.
        </p>
      )}
      <p role="status">{state.message}</p>
    </form>
  );
}
