import Link from "@/components/localized-link";
import {
  privacyKinds,
  privacyStatuses,
  privacyOpen,
  type PrivacyList,
  type PrivacyDetail,
} from "@/lib/privacy-requests";
import {
  PrivacyMessageForm,
  PrivacyReviewForm,
  PrivacyWithdrawForm,
} from "./privacy-request-forms";

export function PrivacyPagination({
  total,
  page,
  href,
}: {
  total: number;
  page: number;
  href: string;
}) {
  const url = (value: number) =>
    `${href}${href.includes("?") ? "&" : "?"}page=${value}`;
  return total > 25 || page > 0 ? (
    <nav className="tab-links" aria-label="Privacy request pages">
      {page > 0 && <Link href={url(page - 1)}>Previous page</Link>}
      <span>
        Page {page + 1} · {total} {total === 1 ? "record" : "records"}
      </span>
      {(page + 1) * 25 < total && <Link href={url(page + 1)}>Next page</Link>}
    </nav>
  ) : null;
}
export function PrivacyRequestList({
  data,
  href,
}: {
  data: PrivacyList;
  href: string;
}) {
  const root = href.split("?")[0];
  return (
    <section className="panel stack">
      <h2>Requests</h2>
      {!data.requests.length ? (
        <p className="muted">No requests on this page.</p>
      ) : (
        data.requests.map((r) => (
          <article key={r.id}>
            <Link className="text-link" href={`${root}/${r.id}`}>
              {privacyKinds[r.kind]} · {r.market} →
            </Link>
            <p className="small">
              <span className="status">{privacyStatuses[r.status]}</span> ·{" "}
              {r.createdAt.slice(0, 10)} · Reference{" "}
              {r.id.slice(0, 8).toUpperCase()}
            </p>
          </article>
        ))
      )}
      <PrivacyPagination total={data.total} page={data.page} href={href} />
    </section>
  );
}
export function PrivacyRequestDetail({
  request,
  staff = false,
  href,
}: {
  request: PrivacyDetail;
  staff?: boolean;
  href: string;
}) {
  return (
    <div className="stack" style={{ overflowWrap: "anywhere" }}>
      <h2>{privacyKinds[request.kind]}</h2>
      <p>
        <span className="status">{privacyStatuses[request.status]}</span> ·{" "}
        {request.market} · Reference {request.id.slice(0, 8).toUpperCase()}
      </p>
      <section className="panel">
        <h3>Your request</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{request.details}</p>
      </section>
      {staff && (
        <p className="notice">
          Identity verification:{" "}
          {request.identityVerified ? "Recorded" : "Not yet recorded"}. Only the
          case owner's authorized market privacy team can review this request;
          staff cannot review their own requests.
        </p>
      )}
      <section className="panel stack">
        <h3>Conversation and progress</h3>
        <p className="small muted">Newest updates first. Times shown in UTC.</p>
        {request.events.map((event) => (
          <article key={event.id}>
            <p className="small muted">
              {event.byStaff ? "RIWAY privacy team" : "Account holder"} ·{" "}
              {new Date(event.createdAt)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19)}{" "}
              UTC · {privacyStatuses[event.status]}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{event.message}</p>
          </article>
        ))}
        <PrivacyPagination
          total={request.totalEvents}
          page={request.page}
          href={href}
        />
      </section>
      {privacyOpen(request.status) &&
        (staff ? (
          <PrivacyReviewForm request={request} />
        ) : (
          <>
            <PrivacyMessageForm request={request} />
            <PrivacyWithdrawForm request={request} />
          </>
        ))}
    </div>
  );
}
