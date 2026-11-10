import Link from "next/link";
import { notFound } from "next/navigation";
import { session, staffAccess } from "@/lib/data";
import { commerceDraftListSchema, type DraftKind } from "@/lib/commerce-drafts";
import { markets, type Product } from "@/lib/domain";
import { pageNumber } from "@/lib/pagination";
import { CommerceDraftForm } from "./commerce-draft-form";

export async function CommerceDraftsPanel({
  kind,
  query,
}: {
  kind: DraftKind;
  query: { edit?: string; page?: string };
}) {
  const access = await staffAccess();
  if (!access.user || !access.allowed || !access.mfa) return null;
  const { client } = await session();
  const page = pageNumber(query.page);
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
  const { data: productRows, error: productError } = await client
    .from("products")
    .select("*")
    .order("name");
  if (productError)
    throw new Error("Products could not be loaded. Please try again.");
  const products = (productRows ?? []) as Product[];
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
        Draft and review states do not activate offers. Applying packages or
        discounts to checkout requires the separate commerce rollout.
      </p>
      {query.edit ? (
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
              <Link className="text-link" href={`${route}?page=${page - 1}`}>
                ← Previous
              </Link>
            )}
            <span>Page {page}</span>
            {list.hasMore && page < 1000 && (
              <Link className="text-link" href={`${route}?page=${page + 1}`}>
                Next →
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
