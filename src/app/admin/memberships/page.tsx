import Link from "@/components/localized-link";
import { session, staffAccess } from "@/lib/data";
import { commerceOfferListSchema } from "@/lib/commerce-offers";
import { staffMembershipsSchema } from "@/lib/membership";
import { markets } from "@/lib/domain";
import { pageNumber } from "@/lib/pagination";
import {
  MembershipApprovalForm,
  MembershipWithdrawalForm,
} from "@/components/membership-admin-forms";
import {
  MembershipDocuments,
  MembershipEnrollmentRecord,
} from "@/components/membership-admin-records";

export const metadata = { title: "Membership administration" };

export default async function MembershipAdministration({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    offerPage?: string | string[];
  }>;
}) {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return null;
  const query = await searchParams;
  const page = pageNumber(query.page);
  const offerPage = pageNumber(query.offerPage);
  const { client } = await session();
  const { data, error } = await client.rpc("staff_memberships", { page });
  if (error) {
    if (["PGRST202", "42883", "42P01"].includes(error.code))
      return (
        <div className="stack">
          <h1>Membership</h1>
          <p className="notice">
            Membership setup is pending. Your administrator must complete it
            before rules or applications can be managed.
          </p>
        </div>
      );
    if (error.code === "42501")
      return (
        <div className="stack">
          <h1>Membership</h1>
          <p className="notice">
            Market administrator or compliance access with verified MFA is
            required to manage membership.
          </p>
        </div>
      );
    throw new Error(
      "Membership records could not be loaded. Please try again.",
    );
  }
  const parsed = staffMembershipsSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.page !== page ||
    new Set(parsed.data.markets).size !== parsed.data.markets.length ||
    parsed.data.rules.some(
      (rule) => !parsed.data.markets.includes(rule.market),
    ) ||
    parsed.data.enrollments.some(
      (enrollment) => !parsed.data.markets.includes(enrollment.market),
    )
  )
    throw new Error(
      "The membership records could not be verified. Please try again.",
    );
  const list = parsed.data;
  const packageResponse = await client.rpc("staff_commerce_offers", {
    k: "package",
    page: offerPage,
  });
  let packageProblem = "";
  if (packageResponse.error) {
    if (["PGRST202", "42883", "42P01"].includes(packageResponse.error.code))
      packageProblem =
        "Package approval setup is pending. Existing membership records remain available below.";
    else if (packageResponse.error.code === "42501")
      packageProblem =
        "Market administrator or compliance access is required to load approved package choices.";
    else
      throw new Error(
        "Approved packages could not be loaded. Please try again.",
      );
  }
  const packageList = packageResponse.error
    ? undefined
    : commerceOfferListSchema.safeParse(packageResponse.data);
  if (
    packageList &&
    (!packageList.success ||
      packageList.data.page !== offerPage ||
      packageList.data.offers.some((offer) => offer.kind !== "package"))
  )
    throw new Error(
      "The approved package choices could not be verified. Please try again.",
    );
  const packages = packageList?.success ? packageList.data : undefined;
  return (
    <div className="stack">
      <h1>Membership</h1>
      <p className="lead">
        Manage first-purchase qualification rules and verify paid membership
        applications against RIWAY’s records.
      </p>
      <p className="notice">
        Rule approval records the package, tier and enrolment documents. It does
        not open sales or confirm a member. Member pricing requires a verified
        RIWAY membership; staff and distributor roles are separate.
      </p>
      {packageProblem ? (
        <p className="notice">{packageProblem}</p>
      ) : packages ? (
        <>
          <MembershipApprovalForm
            offers={packages.offers}
            availableMarkets={list.markets}
          />
          <nav className="admin-actions" aria-label="Approved package pages">
            {offerPage > 1 && (
              <Link
                href={`/admin/memberships?page=${page}&offerPage=${offerPage - 1}`}
              >
                ← Previous packages
              </Link>
            )}
            <span>Approved packages page {offerPage}</span>
            {packages.hasMore && offerPage < 1000 && (
              <Link
                href={`/admin/memberships?page=${page}&offerPage=${offerPage + 1}`}
              >
                Next packages →
              </Link>
            )}
          </nav>
        </>
      ) : null}
      <section className="stack" aria-labelledby="membership-rules-heading">
        <h2 id="membership-rules-heading">Approved membership rules</h2>
        {list.rules.length ? (
          list.rules.map((rule) => (
            <article className="panel stack" key={rule.id}>
              <div className="admin-actions">
                <h3>
                  {rule.packageName ?? "Approved package"} · {rule.tierName}
                </h3>
                <span className="status">
                  {rule.withdrawnAt ? "Withdrawn" : "Active rule"}
                </span>
              </div>
              <p>
                {markets[rule.market].name} · Tier {rule.tierCode} · Minimum{" "}
                {rule.minimumQuantity} package
                {rule.minimumQuantity === 1 ? "" : "s"}
              </p>
              <p className="small muted" style={{ overflowWrap: "anywhere" }}>
                Package approval {rule.packageOfferId} · Reference{" "}
                {rule.approvalReference}
              </p>
              <MembershipDocuments record={rule} />
              <MembershipWithdrawalForm rule={rule} />
            </article>
          ))
        ) : (
          <p className="empty panel">No membership rules on this page.</p>
        )}
      </section>
      <section
        className="stack"
        aria-labelledby="membership-applications-heading"
      >
        <h2 id="membership-applications-heading">Membership applications</h2>
        {list.enrollments.length ? (
          list.enrollments.map((enrollment) => (
            <MembershipEnrollmentRecord
              key={enrollment.id}
              enrollment={enrollment}
              staff
            />
          ))
        ) : (
          <p className="empty panel">
            No membership applications on this page.
          </p>
        )}
      </section>
      <nav className="admin-actions" aria-label="Membership record pages">
        {page > 1 && (
          <Link
            href={`/admin/memberships?page=${page - 1}&offerPage=${offerPage}`}
          >
            ← Previous records
          </Link>
        )}
        <span>Rules and applications page {page}</span>
        {list.hasMore && page < 1000 && (
          <Link
            href={`/admin/memberships?page=${page + 1}&offerPage=${offerPage}`}
          >
            Next records →
          </Link>
        )}
      </nav>
    </div>
  );
}
