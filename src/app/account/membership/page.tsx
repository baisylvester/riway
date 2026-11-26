import Link from "@/components/localized-link";
import { requireSession } from "@/lib/data";
import { myMembershipsSchema } from "@/lib/membership";
import { pageNumber } from "@/lib/pagination";
import { MembershipEnrollmentRecord } from "@/components/membership-admin-records";

export const metadata = { title: "Your membership" };

export default async function AccountMembership({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { client, user } = await requireSession();
  const page = pageNumber((await searchParams).page);
  const { data, error } = await client.rpc("my_memberships", { page });
  if (error) {
    if (["PGRST202", "42883", "42P01"].includes(error.code))
      return (
        <div className="panel stack">
          <h2>Your membership</h2>
          <p className="notice">
            Membership details are awaiting setup. Your existing account and
            orders remain available.
          </p>
          <Link href="/account/orders">View your orders</Link>
        </div>
      );
    throw new Error(
      "Your membership details could not be loaded. Please try again.",
    );
  }
  const parsed = myMembershipsSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.page !== page ||
    parsed.data.enrollments.some((enrollment) => enrollment.userId !== user.id)
  )
    throw new Error(
      "Your membership details could not be verified. Please try again.",
    );
  const list = parsed.data;
  return (
    <div className="stack">
      <div className="panel stack">
        <h2>Your membership</h2>
        {list.membership ? (
          <dl>
            <dt>Current RIWAY status</dt>
            <dd>
              {list.membership.status === "active"
                ? "Active"
                : list.membership.status === "suspended"
                  ? "Suspended"
                  : "Awaiting confirmation"}
            </dd>
            <dt>RIWAY member ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {list.membership.externalMemberId}
            </dd>
            <dt>Current tier</dt>
            <dd>{list.membership.tier}</dd>
          </dl>
        ) : (
          <p>
            No confirmed RIWAY membership is linked to your website account.
          </p>
        )}
        <p className="notice">
          A website account does not create RIWAY membership. Qualifying paid
          purchases are recorded below; member pricing becomes available after
          RIWAY confirms the member record. Existing memberships and upgrades
          require RIWAY’s approved process.
        </p>
        <Link className="text-link" href="/membership">
          Membership information →
        </Link>
      </div>
      <section className="stack" aria-labelledby="membership-history-heading">
        <h2 id="membership-history-heading">
          Qualifying purchases and consent
        </h2>
        {list.enrollments.length ? (
          list.enrollments.map((enrollment) => (
            <MembershipEnrollmentRecord
              key={enrollment.id}
              enrollment={enrollment}
            />
          ))
        ) : (
          <div className="empty panel">
            <p>No qualifying membership purchases on this page.</p>
            <Link className="text-link" href="/shop">
              Explore collections →
            </Link>
          </div>
        )}
      </section>
      <nav className="admin-actions" aria-label="Membership history pages">
        {page > 1 && (
          <Link href={`/account/membership?page=${page - 1}`}>
            ← Previous purchases
          </Link>
        )}
        <span>Membership history page {page}</span>
        {list.hasMore && page < 1000 && (
          <Link href={`/account/membership?page=${page + 1}`}>
            Next purchases →
          </Link>
        )}
      </nav>
    </div>
  );
}
