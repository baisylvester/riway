import Link from "@/components/localized-link";
import type { LibraryAsset } from "@/lib/content-library";
import { StaffActionForm } from "./staff-action-form";
import {
  saveLibraryVersion,
  reviewLibraryVersion,
} from "@/app/admin/library/actions";
export function LibraryFilters({
  query,
}: {
  query: { search: string; locale: string | null; type: string | null };
}) {
  return (
    <form className="panel admin-actions" role="search">
      <label>
        Search title or campaign
        <input
          type="search"
          name="q"
          maxLength={120}
          defaultValue={query.search}
        />
      </label>
      <label>
        Language code
        <input
          name="locale"
          defaultValue={query.locale ?? ""}
          pattern="[a-z]{2}(-[A-Z]{2})?"
          placeholder="en"
          maxLength={5}
        />
      </label>
      <label>
        Format
        <select name="type" defaultValue={query.type ?? ""}>
          <option value="">All formats</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="document">Documents</option>
        </select>
      </label>
      <button className="button button-outline">Search library</button>
    </form>
  );
}
export function LibraryCard({
  asset,
  market,
}: {
  asset: LibraryAsset;
  market: string;
}) {
  return (
    <article className="panel stack">
      <p className="eyebrow">
        {asset.campaign || "RIWAY MATERIAL"} · {asset.locale} ·{" "}
        {asset.mediaType}
      </p>
      <h3>{asset.title}</h3>
      <p>{asset.description}</p>
      <p>
        Version {asset.version} · {asset.market ?? "All markets"}
      </p>
      <Link
        className="text-link"
        href={`/materials/${asset.id}?market=${market}`}
      >
        Open sharing page
      </Link>
    </article>
  );
}
export function LibraryEditor({
  asset,
  market,
}: {
  asset?: LibraryAsset;
  market: string;
}) {
  return (
    <StaffActionForm
      action={saveLibraryVersion}
      submit={asset ? "Save new draft version" : "Create draft asset"}
    >
      <input type="hidden" name="id" value={asset?.id ?? ""} />
      <input type="hidden" name="revision" value={asset?.revision ?? 0} />
      <label>
        Market
        <select
          name="market"
          defaultValue={asset?.market ?? (asset ? "ALL" : market)}
          disabled={!!asset}
        >
          <option value="PH">Philippines</option>
          <option value="SG">Singapore</option>
          <option value="MY">Malaysia</option>
          <option value="ALL">All markets</option>
        </select>
      </label>
      {asset && (
        <input type="hidden" name="market" value={asset.market ?? "ALL"} />
      )}
      <label>
        Title
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={asset?.title}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={asset?.description}
        />
      </label>
      <label>
        Campaign
        <input name="campaign" maxLength={120} defaultValue={asset?.campaign} />
      </label>
      <label>
        Language code
        <input
          name="locale"
          required
          pattern="[a-z]{2}(-[A-Z]{2})?"
          defaultValue={asset?.locale ?? "en"}
        />
      </label>
      <label>
        Format
        <select name="mediaType" defaultValue={asset?.mediaType ?? "image"}>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="document">Document</option>
        </select>
      </label>
      <label>
        Approved source URL
        <input name="url" required maxLength={500} defaultValue={asset?.url} />
      </label>
      <label>
        Transcript / accessible equivalent
        <textarea
          name="transcript"
          maxLength={20000}
          defaultValue={asset?.transcript}
        />
      </label>
      <label>
        Approved disclaimer
        <textarea
          name="disclaimer"
          maxLength={2000}
          defaultValue={asset?.disclaimer}
        />
      </label>
    </StaffActionForm>
  );
}
export function LibraryReview({ asset }: { asset: LibraryAsset }) {
  return (
    <StaffActionForm
      action={reviewLibraryVersion}
      submit="Record review decision"
    >
      <input type="hidden" name="id" value={asset.id} />
      <input type="hidden" name="revision" value={asset.revision} />
      <label>
        Approval / withdrawal reference
        <input name="reference" required minLength={3} maxLength={120} />
      </label>
      <label className="check">
        <input name="withdraw" type="checkbox" />
        Withdraw currently shared version
      </label>
      <label className="check">
        <input name="confirmed" type="checkbox" required />I reviewed this exact
        version and its market, rights, accessibility and approved claims.
      </label>
    </StaffActionForm>
  );
}
