import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/data";
import { privacyDetailSchema, privacyPage } from "@/lib/privacy-requests";
import { PrivacyRequestDetail } from "@/components/privacy-requests";
export const metadata = { title: "Privacy case review" };
export default async function PrivacyReviewDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client } = await requireSession();
  const { data, error } = await client.rpc("get_privacy_request", {
    p_id: id,
    p_staff: true,
    p_page: privacyPage((await searchParams).page),
  });
  if (error?.code === "42501") notFound();
  const parsed = privacyDetailSchema.safeParse(data);
  return (
    <>
      <p>
        <Link
          className="text-link"
          href={
            parsed.success
              ? `/admin/privacy?market=${parsed.data.market}`
              : "/admin/privacy"
          }
        >
          ← Privacy requests
        </Link>
      </p>
      {error || !parsed.success ? (
        <p className="notice">The request could not be loaded. Please retry.</p>
      ) : (
        <PrivacyRequestDetail
          request={parsed.data}
          staff
          href={`/admin/privacy/${id}`}
        />
      )}
    </>
  );
}
