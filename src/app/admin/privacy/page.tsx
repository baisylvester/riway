import { requireSession } from "@/lib/data";
import { marketSchema, type Market } from "@/lib/domain";
import { privacyListSchema, privacyPage } from "@/lib/privacy-requests";
import { PrivacyRequestList } from "@/components/privacy-requests";
export const metadata = { title: "Privacy case review" };
export default async function PrivacyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string; closed?: string; page?: string }>;
}) {
  const { client, user } = await requireSession();
  const query = await searchParams;
  const { data: roles } = await client
    .from("staff_roles")
    .select("market,role")
    .eq("user_id", user.id)
    .in("role", ["admin", "compliance"]);
  const allowed = [
    ...new Set(
      (roles ?? [])
        .map((r) => r.market)
        .filter((m) => marketSchema.safeParse(m).success),
    ),
  ].sort() as Market[];
  if (!allowed.length)
    return (
      <>
        <h1>Privacy requests</h1>
        <p className="notice">
          Market administrator or compliance access and second-step verification
          are required.
        </p>
      </>
    );
  const market = allowed.includes(query.market as Market)
    ? (query.market as Market)
    : allowed[0];
  const closed = query.closed === "1";
  const { data, error } = await client.rpc("list_privacy_requests", {
    p_staff: true,
    p_market: market,
    p_closed: closed,
    p_page: privacyPage(query.page),
  });
  const parsed = privacyListSchema.safeParse(data);
  return (
    <div className="stack">
      <h1>Privacy requests</h1>
      <p>
        Review requests in your authorized market. The account holder sees your
        replies and status updates.
      </p>
      <form className="admin-actions" action="/admin/privacy" method="get">
        <label>
          Market
          <select name="market" defaultValue={market}>
            {allowed.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Queue
          <select name="closed" defaultValue={closed ? "1" : "0"}>
            <option value="0">Open requests</option>
            <option value="1">Closed requests</option>
          </select>
        </label>
        <button className="button button-outline">Apply</button>
      </form>
      {error || !parsed.success ? (
        <p className="notice">
          Privacy requests could not be loaded. Check your role and second-step
          verification, then retry.
        </p>
      ) : (
        <PrivacyRequestList
          data={parsed.data}
          href={`/admin/privacy?market=${market}&closed=${closed ? "1" : "0"}`}
        />
      )}
    </div>
  );
}
