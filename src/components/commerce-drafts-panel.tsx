import Link from "next/link";
import { notFound } from "next/navigation";
import { session, staffAccess } from "@/lib/data";
import { commerceDraftListSchema, type DraftKind } from "@/lib/commerce-drafts";
import { markets, type Product } from "@/lib/domain";
import { pageNumber } from "@/lib/pagination";
import { CommerceDraftForm } from "./commerce-draft-form";
import { commerceOfferListSchema } from "@/lib/commerce-offers";
import {
  CommerceApprovalForm,
  CommerceWithdrawalForm,
} from "./commerce-approval-form";

export type CommerceDraftQuery = {
  edit?: string;
  approve?: string;
  page?: string;
  offersPage?: string;
};

export async function CommerceDraftsPanel({
  kind,
  query,
}: {
  kind: DraftKind;
  query: CommerceDraftQuery;
}) {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return null;
  const { client } = await session();
  const page = pageNumber(query.page);
  const offersPage = pageNumber(query.offersPage);
  const route = `/admin/${kind === "package" ? "packages" : "promotions"}`;
  const title = kind === "package" ? "Package drafts" : "Promotion drafts";
  const { data, error } = await client.rpc("staff_commerce_drafts", {
    k: kind,
    page,
  });
  if (error) {
    if (["PGRST202", "42883", "42P01"].includes(error.code))
      return (
        <div className="stack">
          <h1>{title}</h1>
          <div className="notice">
            <h2>Configuration setup is pending.</h2>
            <p>
              Your administrator must complete setup before drafts can be saved.
              Current shop prices remain in effect.
            </p>
          </div>
        </div>
      );
    if (error.code === "42501")
      return (
        <div className="stack">
          <h1>{title}</h1>
          <p className="notice">
            Market administrator or compliance access is required to manage
            these drafts.
          </p>
        </div>
      );
    throw new Error("Drafts could not be loaded. Please try again.");
  }
  const parsed = commerceDraftListSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("The draft list could not be verified. Please try again.");
  const list = parsed.data;
  if (list.page !== page || list.drafts.some((item) => item.kind !== kind))
    throw new Error("The draft list could not be verified. Please try again.");
  // An edit link only selects a record returned by the market-scoped RPC.
  // Search other pages through the list rather than loading unscoped IDs.
  const draft =
    query.edit && query.edit !== "new"
      ? list.drafts.find((item) => item.id === query.edit && item.kind === kind)
      : undefined;
  if (query.edit && query.edit !== "new" && !draft) notFound();
  const approvalDraft = query.approve
    ? list.drafts.find(
        (item) => item.id === query.approve && item.kind === kind,
      )
    : undefined;
  if ((query.approve && !approvalDraft) || (query.approve && query.edit))
    notFound();
  const { data: productRows, error: productError } = await client
    .from("products")
    .select("*")
    .order("name");
  if (productError)
    throw new Error("Products could not be loaded. Please try again.");
  const products = (productRows ?? []) as Product[];
  const approvedResponse = await client.rpc("staff_commerce_offers", {
    k: kind,
    page: offersPage,
  });
  let approvalProblem = "";
  if (approvedResponse.error) {
    if (["PGRST202", "42883", "42P01"].includes(approvedResponse.error.code))
      approvalProblem =
        "Checkout approval setup is pending. Existing drafts can still be prepared.";
    else if (approvedResponse.error.code === "42501")
      approvalProblem =
        "Market administrator or compliance access is required to manage approved configurations.";
    else
      throw new Error(
        "Approved configurations could not be loaded. Please try again.",
      );
  }
  const approved = approvedResponse.error
    ? undefined
    : commerceOfferListSchema.safeParse(approvedResponse.data);
  if (
    approved &&
    (!approved.success ||
      approved.data.page !== offersPage ||
      approved.data.offers.some((item) => item.kind !== kind))
  )
    throw new Error(
      "The approved configuration list could not be verified. Please try again.",
    );
  const offers = approved?.success ? approved.data : undefined;
  return (
    <div className="stack">
      <div className="admin-actions">
        <h1>{title}</h1>
        {list.markets.length > 0 && (
          <Link className="button" href={`${route}?edit=new`}>
            New {kind} draft
          </Link>
        )}
      </div>
      <p className="lead">
        Prepare market-specific{" "}
        {kind === "package"
          ? "product combinations and proposed prices"
          : "discounts, voucher codes and schedules"}{" "}
        for review.
      </p>
      <p className="notice">
        Draft and review states do not activate offers. Approve a reviewed
        version separately for checkout; market, regulatory and payment
        readiness are checked independently.
      </p>
      {approvalDraft ? (
        <>
          <Link
            className="text-link"
            href={`${route}?page=${page}&offersPage=${offersPage}`}
          >
            ← Back to drafts
          </Link>
          {approvalProblem ? (
            <p className="notice">{approvalProblem}</p>
          ) : (
            <CommerceApprovalForm draft={approvalDraft} products={products} />
          )}
        </>
      ) : query.edit ? (
        <>
          <Link className="text-link" href={`${route}?page=${page}`}>
            ← Back to drafts
          </Link>
          <CommerceDraftForm
            kind={kind}
            draft={draft}
            availableMarkets={list.markets}
            products={products}
          />
        </>
      ) : (
        <>
          {list.drafts.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Market</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Updated</th>
                    <th>Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {list.drafts.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{markets[item.market].name}</td>
                      <td>
                        {item.status === "review"
                          ? "Ready for review"
                          : item.status}
                      </td>
                      <td>{item.revision}</td>
                      <td>
                        {new Date(item.updatedAt).toLocaleString("en-SG", {
                          timeZone: "UTC",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        UTC
                      </td>
                      <td>
                        <Link
                          className="text-link"
                          href={`${route}?page=${page}&edit=${item.id}`}
                        >
                          Edit
                        </Link>
                        {item.status === "review" && !approvalProblem && (
                          <>
                            <br />
                            <Link
                              className="text-link"
                              href={`${route}?page=${page}&offersPage=${offersPage}&approve=${item.id}`}
                            >
                              Review for checkout approval
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty panel">
              <h2>No drafts on this page.</h2>
              <p>Create a draft to prepare proposed rules for review.</p>
            </div>
          )}
          <nav className="admin-actions" aria-label="Draft pages">
            {page > 1 && (
              <Link
                className="text-link"
                href={`${route}?page=${page - 1}&offersPage=${offersPage}`}
              >
                ← Previous
              </Link>
            )}
            <span>Page {page}</span>
            {list.hasMore && page < 1000 && (
              <Link
                className="text-link"
                href={`${route}?page=${page + 1}&offersPage=${offersPage}`}
              >
                Next →
              </Link>
            )}
          </nav>
        </>
      )}
      <section
        className="stack"
        aria-labelledby="approved-configurations-title"
      >
        <h2 id="approved-configurations-title">Approved versions</h2>
        <p>
          Approved versions preserve the reviewed configuration. Editing a draft
          does not change its approved version. Withdraw an existing version
          before approving its replacement.
        </p>
        {approvalProblem ? (
          <p className="notice">{approvalProblem}</p>
        ) : (
          offers && (
            <>
              {offers.offers.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Configuration</th>
                        <th>Market</th>
                        <th>Status</th>
                        <th>Draft version</th>
                        <th>Approval</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.offers.map((offer) => (
                        <tr key={offer.id}>
                          <td>
                            {offer.name}
                            {offer.kind === "promotion" && (
                              <>
                                <br />
                                <span className="small">
                                  Voucher: {offer.definition.voucherCode}
                                </span>
                              </>
                            )}
                          </td>
                          <td>{markets[offer.market].name}</td>
                          <td>
                            {offer.withdrawnAt ? "Withdrawn" : "Approved"}
                          </td>
                          <td>{offer.draftRevision}</td>
                          <td>
                            {offer.approvalReference}
                            <br />
                            <span className="small">
                              {new Date(offer.approvedAt).toLocaleString(
                                "en-SG",
                                {
                                  timeZone: "UTC",
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                },
                              )}{" "}
                              UTC
                            </span>
                            {offer.withdrawnAt && (
                              <>
                                <br />
                                <span className="small">
                                  Withdrawn{" "}
                                  {new Date(offer.withdrawnAt).toLocaleString(
                                    "en-SG",
                                    {
                                      timeZone: "UTC",
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    },
                                  )}{" "}
                                  UTC
                                </span>
                              </>
                            )}
                          </td>
                          <td>
                            <CommerceWithdrawalForm offer={offer} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty panel">
                  <p>No approved versions on this page.</p>
                </div>
              )}
              <nav
                className="admin-actions"
                aria-label="Approved configuration pages"
              >
                {offersPage > 1 && (
                  <Link
                    className="text-link"
                    href={`${route}?page=${page}&offersPage=${offersPage - 1}`}
                  >
                    ← Previous approved versions
                  </Link>
                )}
                <span>Approved versions page {offersPage}</span>
                {offers.hasMore && offersPage < 1000 && (
                  <Link
                    className="text-link"
                    href={`${route}?page=${page}&offersPage=${offersPage + 1}`}
                  >
                    Next approved versions →
                  </Link>
                )}
              </nav>
            </>
          )
        )}
      </section>
    </div>
  );
}
