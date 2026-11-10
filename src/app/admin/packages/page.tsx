import { CommerceDraftsPanel } from "@/components/commerce-drafts-panel";
export const metadata = { title: "Package drafts" };
export default async function Packages({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; page?: string }>;
}) {
  return <CommerceDraftsPanel kind="package" query={await searchParams} />;
}
