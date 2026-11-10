import { CommerceDraftsPanel } from "@/components/commerce-drafts-panel";
export const metadata = { title: "Promotion drafts" };
export default async function Promotions({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; page?: string }>;
}) {
  return <CommerceDraftsPanel kind="promotion" query={await searchParams} />;
}
