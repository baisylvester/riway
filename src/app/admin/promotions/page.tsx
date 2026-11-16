import {
  CommerceDraftsPanel,
  type CommerceDraftQuery,
} from "@/components/commerce-drafts-panel";
export const metadata = { title: "Promotion drafts" };
export default async function Promotions({
  searchParams,
}: {
  searchParams: Promise<CommerceDraftQuery>;
}) {
  return <CommerceDraftsPanel kind="promotion" query={await searchParams} />;
}
