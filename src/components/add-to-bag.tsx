"use client";
import { useState } from "react";
import Link from "next/link";
import { useStore } from "./store-provider";
export function AddToBag({ id }: { id: string }) {
  const { add } = useStore();
  const [added, setAdded] = useState(false);
  return (
    <>
      <button
        className="button"
        onClick={() => {
          add(id);
          setAdded(true);
        }}
      >
        Add to bag for review
      </button>
      {added && (
        <p role="status">
          Added to your bag. <Link href="/cart">View bag →</Link>
        </p>
      )}
      <p className="muted small">
        Products may be saved for review. Online purchasing is unavailable.
      </p>
    </>
  );
}
