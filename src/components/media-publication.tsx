"use client";

import { useActionState } from "react";
import { publishMedia, unpublishMedia } from "@/app/admin/media/actions";

export function MediaPublish({ id }: { id: string }) {
  const [s, a, p] = useActionState(publishMedia, { message: "" });
  return (
    <form action={a} className="stack">
      <input type="hidden" name="id" value={id} />
      <label>
        Approval reference
        <input name="reference" required minLength={3} maxLength={120} />
      </label>
      <button className="button button-outline" disabled={p}>
        {p ? "Publishing…" : "Publish image"}
      </button>
      <p role="status" className="small">
        {s.message}
      </p>
    </form>
  );
}

export function MediaUnpublish({ id, url }: { id: string; url: string }) {
  const [s, a, p] = useActionState(unpublishMedia, { message: "" });
  return (
    <form action={a} className="stack">
      <input type="hidden" name="id" value={id} />
      <a
        className="return-link small"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        Open public image
      </a>
      <button className="button button-outline" disabled={p}>
        {p ? "Unpublishing…" : "Unpublish"}
      </button>
      <p role="status" className="small">
        {s.message}
      </p>
    </form>
  );
}
