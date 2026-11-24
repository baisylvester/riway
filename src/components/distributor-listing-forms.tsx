"use client";

import { useActionState } from "react";
import { saveListing, submitPhoto } from "@/app/distributor/actions";
import type { MyListing } from "@/lib/distributor-directory";

export function DistributorListingForms({ listing }: { listing: MyListing }) {
  const [listState, listAction, listing_] = useActionState(saveListing, {
    message: "",
  });
  const [photoState, photoAction, uploading] = useActionState(submitPhoto, {
    message: "",
  });
  return (
    <div className="panel stack">
      <h2>Your public profile</h2>
      <form action={listAction} className="stack" aria-busy={listing_}>
        <p className="muted">
          Choose whether customers can find you in Find a Distributor. Only your
          display name, code, market, the city you enter and an approved photo
          are shown. No contact details are published.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            name="listed"
            value="on"
            defaultChecked={listing.listed}
          />
          <span>List me in Find a Distributor</span>
        </label>
        <label>
          City (optional)
          <input name="city" maxLength={80} defaultValue={listing.city ?? ""} />
        </label>
        <div className="admin-actions">
          <button className="button button-outline" disabled={listing_}>
            {listing_ ? "Saving…" : "Save listing"}
          </button>
          <span role="status">{listState.message}</span>
        </div>
      </form>
      <form action={photoAction} className="stack" aria-busy={uploading}>
        <h3>Store photo</h3>
        {listing.photoUrl ? (
          <img
            src={listing.photoUrl}
            alt="Your approved store photo"
            width={96}
            height={96}
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <p className="muted">No approved photo yet.</p>
        )}
        {listing.pendingPhoto && (
          <p className="notice">A photo is waiting for RIWAY review.</p>
        )}
        <label>
          Upload a new photo (PNG, JPEG or WebP, up to 3 MB)
          <input
            type="file"
            name="photo"
            accept="image/png,image/jpeg,image/webp"
            required
          />
        </label>
        <div className="admin-actions">
          <button className="button button-outline" disabled={uploading}>
            {uploading ? "Uploading…" : "Send for review"}
          </button>
          <span role="status">{photoState.message}</span>
        </div>
      </form>
    </div>
  );
}
