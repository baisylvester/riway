"use client";

import { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";

export function CartQuantity({
  productName,
  quantity,
  maximum,
  onCommit,
  onRemove,
}: {
  productName: string;
  quantity: number;
  maximum: number;
  onCommit: (quantity: number) => void;
  onRemove: () => void;
}) {
  const limit =
    Number.isInteger(maximum) && maximum > 0 ? Math.min(24, maximum) : 24;
  const errorId = useId();
  const [draft, setDraft] = useState(String(quantity));
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Restore/account and market changes must preserve the saved selection,
    // including a quantity that needs correcting for the new market's limit.
    setDraft(String(quantity));
    setMessage("");
  }, [quantity, limit]);

  const parseDraft = (value: string) => {
    if (!value.trim()) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= limit
      ? number
      : null;
  };
  const invalidDraft = draft !== "" && parseDraft(draft) === null;
  const excessiveSaved = quantity > limit;
  const error =
    message ||
    (excessiveSaved
      ? `Your saved quantity exceeds this market's maximum of ${limit}. Choose a smaller quantity.`
      : "");
  const rangeMessage = `Enter a whole quantity from 1 to ${limit}.`;

  function finishEditing() {
    const next = parseDraft(draft);
    if (next === null) {
      setDraft(String(quantity));
      setMessage(`${rangeMessage} Your previous quantity was kept.`);
      return;
    }
    setDraft(String(next));
    setMessage("");
    if (next !== quantity) onCommit(next);
  }

  return (
    <>
      <label>
        <span className="sr-only">Quantity for {productName}</span>
        <input
          aria-label={`Quantity for ${productName}`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={invalidDraft || excessiveSaved || undefined}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          max={limit}
          value={draft}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setDraft(value);
            setMessage("");
            // A blank field is an editing state. Only Remove deletes a line.
            if (value === "") return;
            const next = parseDraft(value);
            if (next === null) setMessage(rangeMessage);
            else if (next !== quantity) onCommit(next);
          }}
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishEditing();
            }
          }}
        />
      </label>
      <button
        className="delete-button"
        aria-label={`Remove ${productName}`}
        onClick={onRemove}
      >
        <Trash2 size={16} />
      </button>
      {error && (
        <p
          id={errorId}
          className="small error-message"
          role="status"
          style={{ gridColumn: "1 / -1", margin: 0 }}
        >
          {error}
        </p>
      )}
    </>
  );
}
