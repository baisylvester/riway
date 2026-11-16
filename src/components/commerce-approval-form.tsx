"use client";

import { useActionState } from "react";
import {
  approveCommerceDraft,
  withdrawCommerceOffer,
} from "@/app/admin/commerce-offer-actions";
import type { CommerceDraft } from "@/lib/commerce-drafts";
import type { CommerceOffer } from "@/lib/commerce-offers";
import { markets, money, type Product } from "@/lib/domain";

export function CommerceApprovalForm({
  draft,
  products,
}: {
  draft: CommerceDraft;
  products: Product[];
}) {
  const [state, action, pending] = useActionState(approveCommerceDraft, {
    message: "",
  });
  const packageProducts = products.filter(
    (product) =>
      product.category === "Packages" && product.status === "published",
  );
  const selectedIds =
    draft.kind === "package"
      ? draft.definition.components.map((item) => item.productId)
      : draft.definition.productIds;
  const unavailable = selectedIds.some(
    (id) =>
      !products.some(
        (product) =>
          product.id === id &&
          product.status !== "archived" &&
          (draft.kind !== "package" || product.category !== "Packages"),
      ),
  );
  const eligible =
    draft.status === "review" &&
    !unavailable &&
    (draft.kind === "package"
      ? draft.definition.retailMinor !== null && packageProducts.length > 0
      : draft.definition.voucherCode !== null);
  return (
    <form action={action} className="panel stack" aria-busy={pending}>
      <h2>Approve {draft.name}</h2>
      <p>
        {markets[draft.market].name} · Draft version {draft.revision}
      </p>
      <p className="notice">
        Approval records this version for checkout. Market sales approval,
        product registration and payment readiness remain separate requirements.
      </p>
      <input type="hidden" name="draftId" value={draft.id} />
      <input type="hidden" name="kind" value={draft.kind} />
      <input type="hidden" name="market" value={draft.market} />
      <input type="hidden" name="revision" value={draft.revision} />
      {draft.kind === "package" ? (
        <>
          <h3>Package contents</h3>
          <ul>
            {draft.definition.components.map((component) => {
              const product = products.find(
                (item) => item.id === component.productId,
              );
              return (
                <li key={component.productId}>
                  {component.quantity} ×{" "}
                  {product?.name ?? "Unavailable product"}
                  {product && ` · ${product.status}`}
                </li>
              );
            })}
          </ul>
          <p>
            Proposed retail price:{" "}
            {money(
              draft.definition.retailMinor,
              markets[draft.market].currency,
            )}
            . Proposed member price:{" "}
            {money(
              draft.definition.memberMinor,
              markets[draft.market].currency,
            )}
            .
          </p>
          <p>
            Approval copies these prices to the selected package product for
            this market. Later approved market-price edits remain authoritative.
          </p>
        </>
      ) : (
        <>
          <h3>Promotion terms</h3>
          <dl>
            <dt>Discount</dt>
            <dd>
              {draft.definition.discountType === "percent"
                ? `${(draft.definition.discountValue / 100).toFixed(2)}%`
                : money(
                    draft.definition.discountValue,
                    markets[draft.market].currency,
                  )}
            </dd>
            <dt>Minimum eligible subtotal</dt>
            <dd>
              {money(
                draft.definition.minimumSubtotalMinor,
                markets[draft.market].currency,
              )}
            </dd>
            <dt>Maximum percentage discount</dt>
            <dd>
              {draft.definition.maximumDiscountMinor === null
                ? "No additional cap"
                : money(
                    draft.definition.maximumDiscountMinor,
                    markets[draft.market].currency,
                  )}
            </dd>
            <dt>Audience</dt>
            <dd>
              {draft.definition.audience === "all"
                ? "All customers"
                : draft.definition.audience === "member"
                  ? "Members"
                  : "Retail customers"}
            </dd>
            <dt>Starts at</dt>
            <dd>
              {new Date(draft.definition.startsAt).toLocaleString("en-SG", {
                timeZone: "UTC",
                dateStyle: "long",
                timeStyle: "short",
              })}{" "}
              UTC
            </dd>
            <dt>Ends at</dt>
            <dd>
              {new Date(draft.definition.endsAt).toLocaleString("en-SG", {
                timeZone: "UTC",
                dateStyle: "long",
                timeStyle: "short",
              })}{" "}
              UTC
            </dd>
            <dt>Total redemption limit</dt>
            <dd>{draft.definition.usageLimit ?? "No configured limit"}</dd>
          </dl>
          <h3>Eligible products</h3>
          <ul>
            {draft.definition.productIds.map((id) => {
              const product = products.find((item) => item.id === id);
              return (
                <li key={id}>
                  {product?.name ?? "Unavailable product"}
                  {product && ` · ${product.status}`}
                </li>
              );
            })}
          </ul>
          <p>
            Voucher: {draft.definition.voucherCode ?? "Not configured"}. One
            voucher applies per order, once against the selected products’
            subtotal. The minimum subtotal uses those eligible products.
            Percentage discounts round down to whole minor currency units and
            respect the configured cap. Vouchers are not combined. Targets are
            catalogue selections; a component code does not automatically
            discount a package containing it.
          </p>
        </>
      )}
      {unavailable && (
        <p className="notice">
          Some selected products are no longer available. Update the draft
          before approving it.
        </p>
      )}
      {!eligible && (
        <p className="notice">
          Mark the draft ready for review first. Packages need a proposed retail
          price and a published package product; promotions need a voucher code.
        </p>
      )}
      <fieldset
        disabled={pending || !!state.ok || !eligible}
        className="stack"
        style={{ border: 0, margin: 0, padding: 0 }}
      >
        {draft.kind === "package" && (
          <label>
            Published package product
            <select name="productId" required>
              <option value="">Select a package product</option>
              {packageProducts.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Approval reference
          <input name="reference" required minLength={5} maxLength={200} />
        </label>
        <label className="checkbox">
          <input name="acknowledged" type="checkbox" required />
          <span>
            I have reviewed this version and its checkout rules, and have
            authority to approve it for this market.
          </span>
        </label>
        <button
          className="button"
          disabled={pending || !!state.ok || !eligible}
        >
          {pending ? "Approving…" : "Approve version for checkout"}
        </button>
      </fieldset>
      <p role="status">{state.message}</p>
    </form>
  );
}

export function CommerceWithdrawalForm({ offer }: { offer: CommerceOffer }) {
  const [state, action, pending] = useActionState(withdrawCommerceOffer, {
    message: "",
  });
  if (offer.withdrawnAt) return null;
  return (
    <details>
      <summary>Withdraw configuration</summary>
      <form action={action} className="stack" aria-busy={pending}>
        <input type="hidden" name="offerId" value={offer.id} />
        <input type="hidden" name="kind" value={offer.kind} />
        <input type="hidden" name="market" value={offer.market} />
        <fieldset
          disabled={pending || !!state.ok}
          className="stack"
          style={{ border: 0, margin: 0, padding: 0 }}
        >
          <label>
            Withdrawal reference or reason
            <input name="reference" required minLength={5} maxLength={200} />
          </label>
          <label className="checkbox">
            <input name="acknowledged" type="checkbox" required />
            <span>
              Withdraw this version from new orders. Existing orders keep their
              recorded configuration.
            </span>
          </label>
          <button
            className="button button-outline"
            disabled={pending || !!state.ok}
          >
            {pending ? "Withdrawing…" : "Confirm withdrawal"}
          </button>
        </fieldset>
        <p role="status">{state.message}</p>
      </form>
    </details>
  );
}
