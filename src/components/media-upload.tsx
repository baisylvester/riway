"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { markets } from "@/lib/domain";
export function MediaUpload() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    router = useRouter();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/media", {
        method: "POST",
        body: new FormData(form),
      });
      const d = await r.json();
      setMessage(
        r.ok
          ? "Image uploaded to the private editorial library."
          : d.error.message,
      );
      if (r.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage("Upload could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>Upload editorial media</h2>
      <label>
        Market
        <select name="market">
          {Object.entries(markets).map(([c, m]) => (
            <option key={c} value={c}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Image (PNG, JPEG or WebP, max 3 MiB)
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp"
          required
        />
      </label>
      <p className="small muted">
        Files stay private. This library does not publish unapproved media to
        the website.
      </p>
      <button className="button" disabled={busy}>
        Upload image
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
