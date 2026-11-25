import Link from "next/link";
import { currentMarket, requireSession } from "@/lib/data";
import { privacyListSchema, privacyPage } from "@/lib/privacy-requests";
import { PrivacyIntakeForm } from "@/components/privacy-request-forms";
import { PrivacyRequestList } from "@/components/privacy-requests";
export const metadata = { title: "Privacy requests" };
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { client } = await requireSession();
  const { data, error } = await client.rpc("list_privacy_requests", {
    p_page: privacyPage((await searchParams).page),
  });
  const parsed = privacyListSchema.safeParse(data);
  return (
    <div className="stack">
      <h2>Your privacy choices</h2>
      <p>
        <a className="button button-outline" href="/api/account/export">
          Download my account data
        </a>
      </p>
      <p className="small muted">
        The JSON download contains your account data held in this website. It
        does not include external RIWAY system records or erase retained
        transaction records. For a broader request, use the privacy case form
        below.
      </p>
      <p>
        Request access to your data, a correction, deletion or restricted use.
        Follow progress and reply to RIWAY's privacy team here. Requests are
        reviewed individually; submitting one does not immediately change or
        delete your account.
      </p>
      <p>
        <Link className="text-link" href="/legal/privacy">
          Privacy notice →
        </Link>
      </p>
      {error || !parsed.success ? (
        <p className="notice">
          Privacy requests are temporarily unavailable. Please{" "}
          <Link href="/support">contact support</Link>.
        </p>
      ) : (
        <>
          <PrivacyIntakeForm market={await currentMarket()} />
          <PrivacyRequestList data={parsed.data} href="/account/privacy" />
        </>
      )}
    </div>
  );
}
