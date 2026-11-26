import Link from "@/components/localized-link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/data";
import { privacyDetailSchema, privacyPage } from "@/lib/privacy-requests";
import { PrivacyRequestDetail } from "@/components/privacy-requests";
export const metadata = { title: "Your privacy request" };
export default async function PrivacyRequestPage({
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
    p_page: privacyPage((await searchParams).page),
  });
  if (error?.code === "42501") notFound();
  const parsed = privacyDetailSchema.safeParse(data);
  return (
    <>
      <p>
        <Link className="text-link" href="/account/privacy">
          ← Privacy requests
        </Link>
      </p>
      {error || !parsed.success ? (
        <p className="notice">
          This request could not be loaded. Please try again.
        </p>
      ) : (
        <PrivacyRequestDetail
          request={parsed.data}
          href={`/account/privacy/${id}`}
        />
      )}
    </>
  );
}
