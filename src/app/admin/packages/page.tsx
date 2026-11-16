import {
  CommerceDraftsPanel,
  type CommerceDraftQuery,
} from "@/components/commerce-drafts-panel";
export const metadata = { title: "Package drafts" };
export default async function Packages({
  searchParams,
}: {
  searchParams: Promise<CommerceDraftQuery>;
}) {
  return <CommerceDraftsPanel kind="package" query={await searchParams} />;
}
