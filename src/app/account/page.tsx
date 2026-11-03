import Link from "next/link";
import { requireSession } from "@/lib/data";
import { ProfileForm } from "@/components/forms";
export default async function Account() {
  const { client, user } = await requireSession();
  const [
    { data: profile },
    { data: membership },
    { count },
    { data: tickets },
  ] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    client.from("memberships").select("*").eq("user_id", user.id).maybeSingle(),
    client
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    client
      .from("support_tickets")
      .select("id,subject,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <span>RIWAY membership</span>
          <strong>{membership?.status ?? "Not linked"}</strong>
        </div>
        <div className="stat">
          <span>Membership tier</span>
          <strong>{membership?.tier ?? "Awaiting verification"}</strong>
        </div>
        <div className="stat">
          <span>Your orders</span>
          <strong>{count ?? 0}</strong>
        </div>
      </div>
      <div className="two-column">
        <ProfileForm profile={profile} />
        <div className="panel">
          <h2>Every journey is personal.</h2>
          <p className="muted">
            Your website account is separate from RIWAY’s authoritative
            membership records. Membership and sponsor verification will become
            available when the approved integration is connected.
          </p>
          <Link className="text-link" href="/support">
            Contact support →
          </Link>
          <h3 style={{ marginTop: 30 }}>Your support requests</h3>
          {tickets?.length ? (
            tickets.map((t) => (
              <p key={t.id}>
                {t.subject} <span className="status">{t.status}</span>
              </p>
            ))
          ) : (
            <p className="muted small">No support requests yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
